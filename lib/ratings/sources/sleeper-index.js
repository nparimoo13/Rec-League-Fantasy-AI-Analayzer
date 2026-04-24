const path = require('path');
const { FileCache } = require('../../cache/file-cache');

/**
 * Sleeper player metadata index (~5MB JSON, refreshed daily).
 *
 * The endpoint at https://api.sleeper.app/v1/players/nfl returns a giant
 * `{ sleeperId: { full_name, gsis_id, position, team, depth_chart_order, ... } }`
 * map. We persist a trimmed projection plus a few lookup indexes so the
 * ratings pipeline can resolve from any of: Sleeper id, GSIS id, normalized
 * name (+ team for tie-breaking).
 */

const PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30000;
const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

const cache = new FileCache(path.join(__dirname, '..', '..', '..', 'data', 'cache', 'sleeper-index.json'));

function normalizeName(name) {
    return String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,'`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
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

function projectPlayer(sleeperId, p) {
    if (!p || typeof p !== 'object') return null;
    const position = String(p.position || '').toUpperCase();
    const fantasyPositions = Array.isArray(p.fantasy_positions) ? p.fantasy_positions.map(x => String(x || '').toUpperCase()) : [];
    const isOffense = FANTASY_POSITIONS.has(position) || fantasyPositions.some(fp => FANTASY_POSITIONS.has(fp));
    if (!isOffense) return null;

    return {
        sleeperId: String(sleeperId),
        name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        firstName: p.first_name || '',
        lastName: p.last_name || '',
        position,
        team: String(p.team || '').toUpperCase() || null,
        gsisId: p.gsis_id || null,
        espnId: p.espn_id ? String(p.espn_id) : null,
        yahooId: p.yahoo_id ? String(p.yahoo_id) : null,
        rotowireId: p.rotowire_id ? String(p.rotowire_id) : null,
        depthChartOrder: Number.isFinite(p.depth_chart_order) ? p.depth_chart_order : null,
        depthChartPosition: p.depth_chart_position || null,
        injuryStatus: p.injury_status || null,
        status: p.status || null,
        active: p.active !== false,
        years_exp: Number.isFinite(p.years_exp) ? p.years_exp : null
    };
}

/**
 * Build flat lookup tables. We keep multiple keys per player; the resolver
 * picks the most specific match (id > gsis > name+team > name).
 */
function buildIndexes(players) {
    const bySleeperId = {};
    const byGsisId = {};
    const byEspnId = {};
    const byNameTeam = {};
    const byName = {};

    for (const p of players) {
        bySleeperId[p.sleeperId] = p;
        if (p.gsisId) byGsisId[p.gsisId] = p;
        if (p.espnId) byEspnId[p.espnId] = p;
        const nKey = normalizeName(p.name);
        if (nKey) {
            const teamKey = `${nKey}|${(p.team || '').toUpperCase()}`;
            if (!byNameTeam[teamKey]) byNameTeam[teamKey] = p;
            // Name-only index prefers the player with a depth-chart spot to
            // disambiguate retired/duplicate names.
            const existing = byName[nKey];
            if (!existing || (p.depthChartOrder != null && (existing.depthChartOrder == null || p.depthChartOrder < existing.depthChartOrder))) {
                byName[nKey] = p;
            }
        }
    }
    return { bySleeperId, byGsisId, byEspnId, byNameTeam, byName };
}

async function refresh() {
    try {
        const data = await fetchJson(PLAYERS_URL);
        const players = [];
        for (const [id, p] of Object.entries(data || {})) {
            const proj = projectPlayer(id, p);
            if (proj && proj.name) players.push(proj);
        }
        const indexes = buildIndexes(players);
        const payload = {
            asOf: new Date().toISOString(),
            count: players.length,
            players,
            indexes
        };
        cache.set('sleeperIndex', payload, TTL_MS);
        return payload;
    } catch (e) {
        console.warn('ratings/sleeper-index: refresh failed:', e.message);
        const stale = readStaleCache();
        if (stale) return stale;
        return { asOf: null, count: 0, players: [], indexes: { bySleeperId: {}, byGsisId: {}, byEspnId: {}, byNameTeam: {}, byName: {} } };
    }
}

function readStaleCache() {
    const raw = cache.read();
    const entry = raw && raw['sleeperIndex'];
    return entry ? entry.value : null;
}

function getCached() {
    return cache.get('sleeperIndex') || readStaleCache() || { asOf: null, count: 0, players: [], indexes: { bySleeperId: {}, byGsisId: {}, byEspnId: {}, byNameTeam: {}, byName: {} } };
}

function isStale(maxAgeMs = TTL_MS) {
    const data = getCached();
    if (!data || !data.asOf) return true;
    return (Date.now() - new Date(data.asOf).getTime()) > maxAgeMs;
}

async function refreshIfStale(maxAgeMs = TTL_MS) {
    if (isStale(maxAgeMs)) return refresh();
    return getCached();
}

module.exports = {
    refresh,
    refreshIfStale,
    isStale,
    getCached,
    normalizeName,
    buildIndexes
};
