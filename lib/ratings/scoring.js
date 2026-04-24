/**
 * League-aware fantasy points.
 *
 * `scoring` is either a string preset (`full-ppr` | `half-ppr` | `no-ppr` |
 * `standard`) or an object using Sleeper's `scoring_settings` keys
 * (https://docs.sleeper.com/#scoring-settings). Both paths resolve to the
 * same internal multiplier object before scoring.
 *
 * Only the keys that nflverse weekly stats actually expose are honored — rare
 * Sleeper modifiers like `bonus_rec_te` or `idp_*` are ignored on purpose
 * (we don't have the granular data to compute them, so a best-effort baseline
 * is preferable to silently wrong totals).
 */

const PRESETS = {
    'full-ppr': {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        pass_2pt: 2,
        rush_yd: 0.1,
        rush_td: 6,
        rush_2pt: 2,
        rec: 1,
        rec_yd: 0.1,
        rec_td: 6,
        rec_2pt: 2,
        fum_lost: -2,
        st_td: 6
    },
    'half-ppr': {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        pass_2pt: 2,
        rush_yd: 0.1,
        rush_td: 6,
        rush_2pt: 2,
        rec: 0.5,
        rec_yd: 0.1,
        rec_td: 6,
        rec_2pt: 2,
        fum_lost: -2,
        st_td: 6
    },
    'no-ppr': {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        pass_2pt: 2,
        rush_yd: 0.1,
        rush_td: 6,
        rush_2pt: 2,
        rec: 0,
        rec_yd: 0.1,
        rec_td: 6,
        rec_2pt: 2,
        fum_lost: -2,
        st_td: 6
    }
};
PRESETS.standard = PRESETS['no-ppr'];
PRESETS.ppr = PRESETS['full-ppr'];
PRESETS.halfppr = PRESETS['half-ppr'];

function presetMultipliers(name) {
    if (!name) return PRESETS['full-ppr'];
    const key = String(name).toLowerCase().replace(/[\s_]+/g, '-');
    return PRESETS[key] || PRESETS['full-ppr'];
}

/**
 * Translate a Sleeper `scoring_settings` object into our internal multipliers.
 * Sleeper's keys are well-defined; we only pull the ones nflverse data backs.
 */
function fromSleeperSettings(s) {
    if (!s || typeof s !== 'object') return null;
    const get = (k, d = 0) => (typeof s[k] === 'number' ? s[k] : d);
    return {
        pass_yd: get('pass_yd', 0.04),
        pass_td: get('pass_td', 4),
        pass_int: get('pass_int', -2),
        pass_2pt: get('pass_2pt', 2),
        rush_yd: get('rush_yd', 0.1),
        rush_td: get('rush_td', 6),
        rush_2pt: get('rush_2pt', 2),
        rec: get('rec', 0.5),
        rec_yd: get('rec_yd', 0.1),
        rec_td: get('rec_td', 6),
        rec_2pt: get('rec_2pt', 2),
        fum_lost: get('fum_lost', -2),
        st_td: get('st_td', 6)
    };
}

/**
 * Resolve a scoring identifier into multipliers.
 *
 * Accepts:
 *   - 'full-ppr' / 'half-ppr' / 'no-ppr'
 *   - 'league:<id>' — caller is expected to also pass `leagueScoringSettings`
 *   - object — treated as raw Sleeper-style scoring_settings
 */
function resolveScoring(scoring, leagueScoringSettings = null) {
    if (typeof scoring === 'string' && scoring.startsWith('league:')) {
        if (leagueScoringSettings) {
            const m = fromSleeperSettings(leagueScoringSettings);
            if (m) return { kind: 'league', label: scoring, multipliers: m };
        }
        return { kind: 'preset', label: 'full-ppr', multipliers: presetMultipliers('full-ppr') };
    }
    if (typeof scoring === 'object' && scoring !== null) {
        const m = fromSleeperSettings(scoring);
        if (m) return { kind: 'object', label: 'custom', multipliers: m };
    }
    const label = typeof scoring === 'string' ? scoring : 'full-ppr';
    return { kind: 'preset', label, multipliers: presetMultipliers(label) };
}

/**
 * Compute fantasy points for one weekly stat-line. Defensive about missing
 * keys: any unknown stat contributes zero.
 */
function computeFantasyPoints(weekStats, multipliers) {
    if (!weekStats) return 0;
    const m = multipliers || PRESETS['full-ppr'];
    const s = weekStats;

    let pts = 0;
    pts += (s.passing_yards || 0) * (m.pass_yd || 0);
    pts += (s.passing_tds || 0) * (m.pass_td || 0);
    pts += (s.interceptions || 0) * (m.pass_int || 0);
    pts += (s.passing_2pt_conversions || 0) * (m.pass_2pt || 0);

    pts += (s.rushing_yards || 0) * (m.rush_yd || 0);
    pts += (s.rushing_tds || 0) * (m.rush_td || 0);
    pts += (s.rushing_2pt_conversions || 0) * (m.rush_2pt || 0);

    pts += (s.receptions || 0) * (m.rec || 0);
    pts += (s.receiving_yards || 0) * (m.rec_yd || 0);
    pts += (s.receiving_tds || 0) * (m.rec_td || 0);
    pts += (s.receiving_2pt_conversions || 0) * (m.rec_2pt || 0);

    const fumLost = (s.fumbles_lost || 0) + (s.rushing_fumbles_lost || 0) + (s.receiving_fumbles_lost || 0);
    pts += fumLost * (m.fum_lost || 0);
    pts += (s.special_teams_tds || 0) * (m.st_td || 0);

    return Math.round(pts * 100) / 100;
}

module.exports = {
    PRESETS,
    presetMultipliers,
    fromSleeperSettings,
    resolveScoring,
    computeFantasyPoints
};
