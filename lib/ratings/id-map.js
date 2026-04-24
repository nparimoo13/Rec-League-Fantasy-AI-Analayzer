const { normalizeName } = require('./sources/sleeper-index');

/**
 * Resolve an arbitrary "player handle" (anything we get from the UI: a Sleeper
 * id, an ESPN id, a name, a name+team) into a canonical Sleeper-keyed record.
 *
 * The resolver prefers the highest-confidence match available:
 *   1. Sleeper id (exact)
 *   2. GSIS id (nflverse <-> sleeper join)
 *   3. ESPN id (UI fallback when no Sleeper id)
 *   4. name + team
 *   5. normalized name only
 */
function resolveOne(handle, indexes) {
    if (!handle || !indexes) return null;
    const sleeperId = handle.sleeperId || (handle.id != null ? String(handle.id) : null);
    if (sleeperId && indexes.bySleeperId[sleeperId]) return { match: indexes.bySleeperId[sleeperId], reason: 'sleeperId' };

    const gsisId = handle.gsisId || handle.gsis_id;
    if (gsisId && indexes.byGsisId[gsisId]) return { match: indexes.byGsisId[gsisId], reason: 'gsisId' };

    const espnId = handle.espnId || handle.espn_id;
    if (espnId && indexes.byEspnId[String(espnId)]) return { match: indexes.byEspnId[String(espnId)], reason: 'espnId' };

    const name = handle.name || handle.full_name || '';
    const team = (handle.team || '').toString().toUpperCase();
    const nKey = normalizeName(name);
    if (!nKey) return null;
    if (team) {
        const teamKey = `${nKey}|${team}`;
        if (indexes.byNameTeam[teamKey]) return { match: indexes.byNameTeam[teamKey], reason: 'name+team' };
    }
    if (indexes.byName[nKey]) return { match: indexes.byName[nKey], reason: 'name' };

    const parts = nKey.split(' ');
    if (parts.length >= 3) {
        const lastTwo = parts.slice(-2).join(' ');
        if (indexes.byName[lastTwo]) return { match: indexes.byName[lastTwo], reason: 'name-tail' };
    }
    return null;
}

function resolveMany(handles, indexes) {
    const results = new Map();
    for (const h of (handles || [])) {
        const r = resolveOne(h, indexes);
        if (r) results.set(r.match.sleeperId, { ...r, handle: h });
    }
    return results;
}

/**
 * Build a fast `gsisId -> sleeperPlayer` view from the cached Sleeper index,
 * plus a name-based fallback for nflverse rows that lack a GSIS id.
 *
 * Returns:
 *   - matchByGsis(gsisId) -> sleeperPlayer | null
 *   - matchByNameTeam(name, team) -> sleeperPlayer | null
 */
function buildJoiners(indexes) {
    return {
        matchByGsis: (gsisId) => (gsisId ? indexes.byGsisId[gsisId] || null : null),
        matchByNameTeam: (name, team) => {
            const nKey = normalizeName(name);
            if (!nKey) return null;
            const teamKey = `${nKey}|${(team || '').toUpperCase()}`;
            return indexes.byNameTeam[teamKey] || indexes.byName[nKey] || null;
        }
    };
}

module.exports = {
    resolveOne,
    resolveMany,
    buildJoiners,
    normalizeName
};
