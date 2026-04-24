const path = require('path');
const { FileCache } = require('../cache/file-cache');

const TEAMS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams';
const ROSTER_URL = id => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`;
const ATHLETE_URL = id => `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}/overview`;

const ATHLETE_INDEX_TTL_MS = 24 * 60 * 60 * 1000;
const ATHLETE_DETAIL_TTL_MS = 30 * 60 * 1000;

const cache = new FileCache(path.join(__dirname, '..', '..', 'data', 'cache', 'espn.json'));

function normalizeName(name) {
    return String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,'`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

async function fetchJson(url, { timeoutMs = 8000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'RecLeagueFantasyAI/1.0 (+espn)' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function buildAthleteIndex() {
    const teamsData = await fetchJson(TEAMS_URL);
    const teams = [];
    const leagues = teamsData?.sports?.[0]?.leagues || [];
    for (const league of leagues) {
        for (const t of (league.teams || [])) {
            const team = t.team || t;
            if (team?.id && team?.abbreviation) {
                teams.push({ id: String(team.id), abbreviation: team.abbreviation });
            }
        }
    }

    const byKey = {};
    const rosterResults = await Promise.allSettled(teams.map(t => fetchJson(ROSTER_URL(t.id))));
    rosterResults.forEach((res, idx) => {
        if (res.status !== 'fulfilled') return;
        const teamAbbr = teams[idx].abbreviation;
        const groups = res.value?.athletes || [];
        for (const group of groups) {
            for (const it of (group.items || [])) {
                const name = it.fullName || it.displayName || it.shortName || it.name;
                if (!name || !it.id) continue;
                const pos = it.position?.abbreviation || it.position?.displayName || '';
                const key = normalizeName(name);
                if (!byKey[key]) {
                    byKey[key] = { id: String(it.id), name, position: pos, team: teamAbbr };
                }
            }
        }
    });

    cache.set('athleteIndex', byKey, ATHLETE_INDEX_TTL_MS);
    return byKey;
}

async function getAthleteIndex() {
    const cached = cache.get('athleteIndex');
    if (cached) return cached;
    try {
        return await buildAthleteIndex();
    } catch (e) {
        console.warn('espn: failed to build athlete index:', e.message);
        return {};
    }
}

function lookupAthlete(index, name) {
    const key = normalizeName(name);
    if (index[key]) return index[key];
    const parts = key.split(' ');
    if (parts.length >= 2) {
        const lastTwo = parts.slice(-2).join(' ');
        if (index[lastTwo]) return index[lastTwo];
    }
    return null;
}

function summarizeInjury(overview) {
    const ath = overview?.athlete || overview;
    const injuries = ath?.injuries || overview?.injuries || [];
    if (!Array.isArray(injuries) || injuries.length === 0) return null;
    const top = injuries[0];
    return {
        status: top?.status || top?.type?.description || top?.shortComment || null,
        detail: top?.longComment || top?.shortComment || top?.details?.detail || null,
        date: top?.date || null
    };
}

async function getAthleteOverview(athleteId) {
    const cacheKey = `athlete:${athleteId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    try {
        const data = await fetchJson(ATHLETE_URL(athleteId));
        const ath = data?.athlete || {};
        const overview = {
            id: String(athleteId),
            displayName: ath.displayName || ath.fullName || null,
            position: ath.position?.abbreviation || null,
            team: ath.team?.abbreviation || null,
            status: ath.status?.type || ath.status?.name || null,
            injury: summarizeInjury(data),
            sourceUrl: ath.links?.find?.(l => l?.href)?.href || `https://www.espn.com/nfl/player/_/id/${athleteId}`
        };
        cache.set(cacheKey, overview, ATHLETE_DETAIL_TTL_MS);
        return overview;
    } catch (e) {
        return null;
    }
}

/**
 * Resolve a list of player names to structured ESPN data.
 * Returns one entry per input (in the same order); missing matches are null.
 */
async function getStructuredForPlayers(names, { concurrency = 5 } = {}) {
    const unique = Array.from(new Set(names.map(n => String(n || '').trim()).filter(Boolean)));
    const index = await getAthleteIndex();

    const results = {};
    let i = 0;
    async function worker() {
        while (i < unique.length) {
            const name = unique[i++];
            const ath = lookupAthlete(index, name);
            if (!ath) { results[name] = null; continue; }
            const overview = await getAthleteOverview(ath.id);
            results[name] = overview ? { ...overview, name } : { id: ath.id, name, position: ath.position, team: ath.team, status: null, injury: null, sourceUrl: `https://www.espn.com/nfl/player/_/id/${ath.id}` };
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));

    return names.map(n => results[String(n || '').trim()] || null);
}

module.exports = {
    getAthleteIndex,
    getStructuredForPlayers,
    buildAthleteIndex
};
