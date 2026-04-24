const path = require('path');
const { FileCache } = require('../cache/file-cache');
const nflverse = require('./sources/nflverse');
const sleeperIndex = require('./sources/sleeper-index');
const { resolveOne } = require('./id-map');
const { computeRatings } = require('./compute');
const { resolveScoring } = require('./scoring');

/**
 * Orchestrator for the player-rating pipeline.
 *
 * Responsibilities:
 *   - Lazy-refresh the underlying nflverse + Sleeper caches.
 *   - Cache the computed rating table per scoring identifier so repeated
 *     calls within an hour avoid recomputing.
 *   - Cache Sleeper league `scoring_settings` for `league:<id>` requests.
 *   - Expose `getRatings({ players, scoring })` which resolves arbitrary
 *     handles (Sleeper id, name, name+team) into rating objects.
 */

const RATINGS_TTL_MS = 6 * 60 * 60 * 1000;
const LEAGUE_SETTINGS_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const SLEEPER_LEAGUE_URL = id => `https://api.sleeper.app/v1/league/${id}`;

const cache = new FileCache(path.join(__dirname, '..', '..', 'data', 'cache', 'ratings.json'));
const memoryTables = new Map();
let pollerHandle = null;

function scoringCacheKey(scoringLabel) {
    return `table:${scoringLabel}`;
}

async function fetchJson(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'RecLeagueFantasyAI/1.0 (+ratings)' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function getLeagueScoringSettings(leagueId) {
    if (!leagueId) return null;
    const key = `league:${leagueId}`;
    const cached = cache.get(key);
    if (cached) return cached;
    try {
        const data = await fetchJson(SLEEPER_LEAGUE_URL(leagueId));
        const settings = data?.scoring_settings || null;
        if (settings) cache.set(key, settings, LEAGUE_SETTINGS_TTL_MS);
        return settings;
    } catch (e) {
        console.warn(`ratings: failed to load Sleeper league ${leagueId} scoring:`, e.message);
        return null;
    }
}

function tableCacheLabel(scoring, leagueId) {
    if (typeof scoring === 'string') return scoring.startsWith('league:') ? scoring : scoring;
    if (typeof scoring === 'object' && scoring !== null) return 'custom';
    return 'full-ppr';
}

function tableToObject(table) {
    const out = {};
    for (const [k, v] of table.entries()) out[k] = v;
    return out;
}

function objectToTable(obj) {
    const t = new Map();
    for (const [k, v] of Object.entries(obj || {})) t.set(k, v);
    return t;
}

/**
 * Recompute the rating table for a specific scoring identifier and persist it.
 * Memoizes in-process and on-disk; both keyed by `scoringLabel`.
 */
async function buildTable(scoring) {
    const [nflverseData, sleeperData] = await Promise.all([
        nflverse.refreshIfStale().catch(e => { console.warn('ratings: nflverse refresh failed:', e.message); return nflverse.getCached(); }),
        sleeperIndex.refreshIfStale().catch(e => { console.warn('ratings: sleeper index refresh failed:', e.message); return sleeperIndex.getCached(); })
    ]);

    let leagueScoringSettings = null;
    if (typeof scoring === 'string' && scoring.startsWith('league:')) {
        const leagueId = scoring.slice('league:'.length);
        leagueScoringSettings = await getLeagueScoringSettings(leagueId);
    }
    const resolved = resolveScoring(scoring, leagueScoringSettings);

    const computed = computeRatings({
        stats: nflverseData.stats || [],
        snaps: nflverseData.snaps || [],
        sleeperPlayers: sleeperData,
        scoring: resolved.multipliers,
        scoringLabel: resolved.label,
        asOf: new Date().toISOString()
    });

    const payload = {
        scoring: resolved.label,
        scoringKind: resolved.kind,
        nflverseSeason: nflverseData.season,
        sleeperAsOf: sleeperData.asOf,
        asOf: computed.asOf,
        size: computed.table.size,
        table: tableToObject(computed.table)
    };
    const key = scoringCacheKey(resolved.label);
    cache.set(key, payload, RATINGS_TTL_MS);
    memoryTables.set(resolved.label, { table: computed.table, asOf: computed.asOf });
    return { table: computed.table, payload };
}

async function getTableForScoring(scoring) {
    let leagueScoringSettings = null;
    if (typeof scoring === 'string' && scoring.startsWith('league:')) {
        leagueScoringSettings = await getLeagueScoringSettings(scoring.slice('league:'.length));
    }
    const resolved = resolveScoring(scoring, leagueScoringSettings);
    const memo = memoryTables.get(resolved.label);
    if (memo) return { table: memo.table, asOf: memo.asOf, scoring: resolved.label };

    const cached = cache.get(scoringCacheKey(resolved.label));
    if (cached && cached.table) {
        const t = objectToTable(cached.table);
        memoryTables.set(resolved.label, { table: t, asOf: cached.asOf });
        return { table: t, asOf: cached.asOf, scoring: resolved.label };
    }
    const built = await buildTable(scoring);
    return { table: built.table, asOf: built.payload.asOf, scoring: resolved.label };
}

/**
 * Resolve a list of player handles to rating entries.
 *
 * `players` items may carry any combination of:
 *   { sleeperId, id, gsisId, espnId, name, team }
 *
 * Output preserves input order; entries that don't resolve get a stub
 * `{ player_id: null, rating: null, drivers: ['No qualifying games'] }`
 * so the UI can still render `--`.
 */
async function getRatings({ players = [], scoring = 'full-ppr' } = {}) {
    const sleeperData = await sleeperIndex.refreshIfStale().catch(() => sleeperIndex.getCached());
    const { table, asOf, scoring: scoringLabel } = await getTableForScoring(scoring);

    const out = [];
    for (const handle of players) {
        const resolved = resolveOne(handle, sleeperData.indexes);
        if (!resolved) {
            out.push(makeMissing(handle, scoringLabel, asOf, 'Player not found in roster index'));
            continue;
        }
        const entry = table.get(resolved.match.sleeperId);
        if (!entry) {
            out.push(makeMissing(handle, scoringLabel, asOf, 'No qualifying games'));
            continue;
        }
        out.push({ ...entry, requestedHandle: handle, matchReason: resolved.reason });
    }
    return { ratings: out, asOf, scoring: scoringLabel, size: table.size };
}

function makeMissing(handle, scoring, asOf, reason) {
    return {
        player_id: handle?.sleeperId || (handle?.id != null ? String(handle.id) : null),
        name: handle?.name || handle?.full_name || null,
        position: handle?.position || null,
        team: handle?.team || null,
        rating: null,
        rawRating: null,
        confidence: 0,
        games: 0,
        window: 5,
        avgFantasyPoints: null,
        drivers: [reason],
        availabilityFactor: 1,
        scoring,
        asOf,
        requestedHandle: handle,
        matchReason: null
    };
}

async function refreshAll(scorings = ['full-ppr', 'half-ppr', 'no-ppr']) {
    await nflverse.refresh();
    await sleeperIndex.refresh();
    for (const sc of scorings) {
        try {
            await buildTable(sc);
        } catch (e) {
            console.warn(`ratings: build table failed for ${sc}:`, e.message);
        }
    }
    return { asOf: new Date().toISOString(), scorings };
}

function startPoller({ intervalHours = 24 } = {}) {
    stopPoller();
    const ms = Math.max(1, intervalHours) * 60 * 60 * 1000;
    refreshAll().catch(e => console.warn('ratings: initial refresh failed:', e.message));
    pollerHandle = setInterval(() => {
        refreshAll().catch(e => console.warn('ratings: scheduled refresh failed:', e.message));
    }, ms);
    if (pollerHandle.unref) pollerHandle.unref();
}

function stopPoller() {
    if (pollerHandle) {
        clearInterval(pollerHandle);
        pollerHandle = null;
    }
}

module.exports = {
    getRatings,
    refreshAll,
    startPoller,
    stopPoller,
    buildTable,
    getLeagueScoringSettings
};
