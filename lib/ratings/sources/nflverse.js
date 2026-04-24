const path = require('path');
const { FileCache } = require('../../cache/file-cache');

/**
 * nflverse data source: weekly per-player stats + offensive snap counts.
 *
 * The nflverse releases publish one CSV per season at predictable URLs:
 *   - https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_{YYYY}.csv
 *   - https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{YYYY}.csv
 *
 * Files are downloaded at most once per `STATS_TTL_MS` and cached on disk.
 * When a season's CSV is not yet published (e.g. early in the new league year),
 * we automatically fall back to the previous season so ratings stay populated.
 */

const STATS_URL = season => `https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_${season}.csv`;
const SNAPS_URL = season => `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`;

const STATS_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30000;

const cache = new FileCache(path.join(__dirname, '..', '..', '..', 'data', 'cache', 'nflverse.json'));

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function currentSeasonGuess() {
    const now = new Date();
    const year = now.getUTCFullYear();
    // NFL regular season starts in early September. Before that, the prior year
    // is the most recently completed season.
    return now.getUTCMonth() < 7 ? year - 1 : year;
}

async function fetchText(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'RecLeagueFantasyAI/1.0 (+ratings)' }
        });
        if (!res.ok) {
            const err = new Error(`HTTP ${res.status} for ${url}`);
            err.status = res.status;
            throw err;
        }
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Minimal RFC4180-ish CSV parser. nflverse files use UTF-8, comma separators,
 * optional double-quoted fields with embedded commas, and `NA` for missing
 * numeric values. We treat empty + `NA` as null; numeric coercion happens at
 * the row layer.
 */
function parseCsv(text) {
    if (!text) return { headers: [], rows: [] };
    const out = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const len = text.length;

    for (let i = 0; i < len; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === ',') {
            row.push(field);
            field = '';
            continue;
        }
        if (ch === '\r') continue;
        if (ch === '\n') {
            row.push(field);
            out.push(row);
            row = [];
            field = '';
            continue;
        }
        field += ch;
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        out.push(row);
    }

    if (out.length === 0) return { headers: [], rows: [] };
    const headers = out[0].map(h => String(h || '').trim());
    const rows = [];
    for (let r = 1; r < out.length; r++) {
        const cells = out[r];
        if (cells.length === 1 && cells[0] === '') continue;
        const obj = {};
        for (let c = 0; c < headers.length; c++) {
            const v = cells[c];
            obj[headers[c]] = (v == null || v === '' || v === 'NA') ? null : v;
        }
        rows.push(obj);
    }
    return { headers, rows };
}

function num(v) {
    if (v == null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function nonNullNum(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Project a wide nflverse weekly-stats row into the small bag of fields we
 * use downstream. Field names mirror nflverse's `stats_player_week_{YYYY}`
 * schema (column names occasionally drift between seasons; new fields can
 * be added here without breaking older caches).
 */
function projectStatsRow(row) {
    const position = String(row.position || row.position_group || '').toUpperCase();
    if (!FANTASY_POSITIONS.has(position)) return null;
    const playerId = row.player_id || row.gsis_id || row.player_gsis_id;
    if (!playerId) return null;
    const week = parseInt(row.week, 10);
    if (!Number.isFinite(week) || week <= 0) return null;
    const seasonType = String(row.season_type || 'REG').toUpperCase();
    if (seasonType && seasonType !== 'REG') return null;

    return {
        playerId: String(playerId),
        playerName: row.player_display_name || row.player_name || row.full_name || '',
        position,
        team: String(row.recent_team || row.team || '').toUpperCase(),
        season: parseInt(row.season, 10) || null,
        week,
        opponent: String(row.opponent_team || '').toUpperCase() || null,
        stats: {
            completions: num(row.completions),
            attempts: num(row.attempts),
            passing_yards: num(row.passing_yards),
            passing_tds: num(row.passing_tds),
            interceptions: num(row.interceptions),
            sacks: num(row.sacks),
            sack_yards: num(row.sack_yards),
            passing_2pt_conversions: num(row.passing_2pt_conversions),
            passing_first_downs: num(row.passing_first_downs),
            pass_yards_after_catch: num(row.passing_yards_after_catch),

            carries: num(row.carries),
            rushing_yards: num(row.rushing_yards),
            rushing_tds: num(row.rushing_tds),
            rushing_fumbles: num(row.rushing_fumbles),
            rushing_fumbles_lost: num(row.rushing_fumbles_lost),
            rushing_2pt_conversions: num(row.rushing_2pt_conversions),
            rushing_first_downs: num(row.rushing_first_downs),

            targets: num(row.targets),
            receptions: num(row.receptions),
            receiving_yards: num(row.receiving_yards),
            receiving_tds: num(row.receiving_tds),
            receiving_fumbles: num(row.receiving_fumbles),
            receiving_fumbles_lost: num(row.receiving_fumbles_lost),
            receiving_2pt_conversions: num(row.receiving_2pt_conversions),
            receiving_first_downs: num(row.receiving_first_downs),
            receiving_air_yards: num(row.receiving_air_yards),
            receiving_yards_after_catch: num(row.receiving_yards_after_catch),
            target_share: nonNullNum(row.target_share),
            air_yards_share: nonNullNum(row.air_yards_share),
            wopr: nonNullNum(row.wopr),
            racr: nonNullNum(row.racr),

            special_teams_tds: num(row.special_teams_tds),
            fumbles_lost: num(row.fumbles_lost),

            // nflverse exposes pre-computed fantasy points for cross-checking.
            fantasy_points: nonNullNum(row.fantasy_points),
            fantasy_points_ppr: nonNullNum(row.fantasy_points_ppr)
        }
    };
}

function projectSnapRow(row) {
    const playerName = row.player || row.player_name || row.full_name || '';
    const week = parseInt(row.week, 10);
    if (!playerName || !Number.isFinite(week)) return null;
    const seasonType = String(row.game_type || row.season_type || 'REG').toUpperCase();
    if (seasonType && seasonType !== 'REG') return null;
    const position = String(row.position || '').toUpperCase();
    if (!FANTASY_POSITIONS.has(position)) return null;

    const offSnaps = nonNullNum(row.offense_snaps);
    const offPct = nonNullNum(row.offense_pct);
    return {
        playerName,
        position,
        team: String(row.team || '').toUpperCase(),
        season: parseInt(row.season, 10) || null,
        week,
        offSnaps: offSnaps == null ? 0 : offSnaps,
        offPct: offPct == null ? 0 : (offPct > 1 ? offPct / 100 : offPct),
        pfrId: row.pfr_player_id || row.pfr_id || null
    };
}

async function fetchSeasonStats(season) {
    const txt = await fetchText(STATS_URL(season));
    const { rows } = parseCsv(txt);
    const projected = [];
    for (const r of rows) {
        const p = projectStatsRow(r);
        if (p) projected.push(p);
    }
    return projected;
}

async function fetchSeasonSnaps(season) {
    const txt = await fetchText(SNAPS_URL(season));
    const { rows } = parseCsv(txt);
    const projected = [];
    for (const r of rows) {
        const p = projectSnapRow(r);
        if (p) projected.push(p);
    }
    return projected;
}

async function fetchWithFallback(seasonGuess, fetcher, label) {
    const tried = [];
    for (const season of [seasonGuess, seasonGuess - 1]) {
        try {
            const data = await fetcher(season);
            if (data && data.length > 0) {
                return { season, data };
            }
            tried.push(`${season}: empty`);
        } catch (e) {
            tried.push(`${season}: ${e.status || e.message}`);
            if (e.status && e.status !== 404) throw e;
        }
    }
    throw new Error(`nflverse ${label} unavailable (tried ${tried.join('; ')})`);
}

/**
 * Refresh the on-disk cache. Returns the active payload.
 * On any failure, returns the last-good cached payload (never throws to caller).
 */
async function refresh({ season } = {}) {
    const seasonGuess = season || currentSeasonGuess();
    try {
        const stats = await fetchWithFallback(seasonGuess, fetchSeasonStats, 'player_stats');
        const snaps = await fetchWithFallback(seasonGuess, fetchSeasonSnaps, 'snap_counts').catch(e => {
            console.warn('ratings/nflverse: snap_counts unavailable, continuing without snaps:', e.message);
            return { season: stats.season, data: [] };
        });
        const payload = {
            season: stats.season,
            snapsSeason: snaps.season,
            stats: stats.data,
            snaps: snaps.data,
            asOf: new Date().toISOString()
        };
        cache.set('nflverse', payload, STATS_TTL_MS);
        return payload;
    } catch (e) {
        console.warn('ratings/nflverse: refresh failed:', e.message);
        const fallback = cache.get('nflverse') || readStaleCache();
        if (fallback) return fallback;
        return { season: seasonGuess, snapsSeason: seasonGuess, stats: [], snaps: [], asOf: null };
    }
}

function readStaleCache() {
    const raw = cache.read();
    const entry = raw && raw['nflverse'];
    return entry ? entry.value : null;
}

function getCached() {
    return cache.get('nflverse') || readStaleCache() || { season: null, snapsSeason: null, stats: [], snaps: [], asOf: null };
}

function isStale(maxAgeMs = STATS_TTL_MS) {
    const data = getCached();
    if (!data || !data.asOf) return true;
    return (Date.now() - new Date(data.asOf).getTime()) > maxAgeMs;
}

async function refreshIfStale(maxAgeMs = STATS_TTL_MS) {
    if (isStale(maxAgeMs)) return refresh();
    return getCached();
}

module.exports = {
    refresh,
    refreshIfStale,
    isStale,
    getCached,
    currentSeasonGuess,
    parseCsv,
    projectStatsRow,
    projectSnapRow
};
