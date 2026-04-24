const { computeFantasyPoints } = require('./scoring');
const { buildJoiners, normalizeName } = require('./id-map');

/**
 * Compute v1 player ratings.
 *
 * Pipeline (per fantasy position QB/RB/WR/TE):
 *   1. Group nflverse weekly rows by sleeperId via the id-map joiner.
 *   2. Take the trailing N games (default 5, min 2) per player.
 *   3. Build per-player per-game series:
 *        - opportunity (volume) score
 *        - efficiency (fantasy points / opportunity)
 *        - scoring (fantasy points using the requested scoring)
 *   4. Z-score each component within position, weighted-sum them, then
 *      percentile-rank within the active player pool.
 *   5. Map percentile to a 60-98 cosmetic scale; multiply by an availability
 *      factor (injury / depth chart penalties); clamp to 50-99; round to 1dp.
 *
 * Confidence is a 0-1 number that scales with games-in-window so the UI can
 * show a soft band (e.g. dim the chip) when we don't have enough signal.
 */

const TRAILING_WINDOW = 5;
const MIN_GAMES = 2;

const POSITION_WEIGHTS = {
    QB: { scoring: 0.50, volume: 0.30, efficiency: 0.20 },
    RB: { scoring: 0.45, volume: 0.35, efficiency: 0.20 },
    WR: { scoring: 0.45, volume: 0.30, efficiency: 0.25 },
    TE: { scoring: 0.45, volume: 0.30, efficiency: 0.25 }
};

function volumeScoreForRow(position, statsRow, snapsRow) {
    const s = statsRow.stats || {};
    const off = snapsRow ? snapsRow.offSnaps : 0;
    if (position === 'QB') {
        return (s.attempts || 0) + 0.5 * (s.carries || 0);
    }
    if (position === 'RB') {
        return (off ? 0.6 * off : 0) + (s.carries || 0) + 1.2 * (s.targets || 0);
    }
    if (position === 'WR' || position === 'TE') {
        return (off ? 0.4 * off : 0) + 1.4 * (s.targets || 0);
    }
    return 0;
}

function meanStd(values) {
    const n = values.length;
    if (n === 0) return { mean: 0, std: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / n;
    if (n === 1) return { mean, std: 0 };
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
    return { mean, std: Math.sqrt(variance) };
}

function zscore(value, { mean, std }) {
    if (!std || !Number.isFinite(std) || std === 0) return 0;
    return (value - mean) / std;
}

function percentileRank(values, value) {
    const n = values.length;
    if (n === 0) return 0.5;
    let below = 0;
    let equal = 0;
    for (const v of values) {
        if (v < value) below++;
        else if (v === value) equal++;
    }
    return (below + 0.5 * equal) / n;
}

function availabilityFactor(sleeperPlayer) {
    if (!sleeperPlayer) return { factor: 1.0, drivers: [] };
    const drivers = [];
    let factor = 1.0;
    const status = String(sleeperPlayer.injuryStatus || sleeperPlayer.status || '').toUpperCase();
    if (status === 'OUT' || status === 'IR' || status === 'PUP' || status === 'NFI' || status === 'INJURED_RESERVE') {
        factor *= 0.5;
        drivers.push(`Injury: ${status} (-50%)`);
    } else if (status === 'DOUBTFUL') {
        factor *= 0.7;
        drivers.push('Injury: Doubtful (-30%)');
    } else if (status === 'QUESTIONABLE') {
        factor *= 0.9;
        drivers.push('Injury: Questionable (-10%)');
    }
    const dco = sleeperPlayer.depthChartOrder;
    if (Number.isFinite(dco) && dco > 1) {
        const pos = sleeperPlayer.position;
        if (pos === 'QB' || pos === 'TE') {
            factor *= 0.6;
            drivers.push(`Depth chart: #${dco} (-40%)`);
        } else {
            factor *= 0.85;
            drivers.push(`Depth chart: #${dco} (-15%)`);
        }
    }
    return { factor, drivers };
}

function topPercentDriver(percent, label) {
    if (percent >= 0.9) return `Elite ${label} (top ${Math.max(1, Math.round((1 - percent) * 100))}%)`;
    if (percent >= 0.75) return `Strong ${label} (top ${Math.round((1 - percent) * 100)}%)`;
    if (percent <= 0.1) return `Weak ${label} (bottom ${Math.max(1, Math.round(percent * 100))}%)`;
    if (percent <= 0.25) return `Below-average ${label} (bottom ${Math.round(percent * 100)}%)`;
    return null;
}

/**
 * Pre-compute per-player per-game points for the requested scoring system,
 * then aggregate into a trailing-window summary.
 */
function buildPlayerSummaries(stats, snaps, sleeperPlayers, multipliers) {
    const joiners = buildJoiners(sleeperPlayers.indexes);
    const snapKey = (name, team) => `${normalizeName(name)}|${(team || '').toUpperCase()}`;
    const snapMap = new Map();
    for (const sn of snaps) {
        const k = `${snapKey(sn.playerName, sn.team)}|${sn.week}`;
        snapMap.set(k, sn);
    }

    const bySleeper = new Map();
    for (const row of stats) {
        const sleeper = joiners.matchByGsis(row.playerId) || joiners.matchByNameTeam(row.playerName, row.team);
        if (!sleeper) continue;
        const sn = snapMap.get(`${snapKey(row.playerName, row.team)}|${row.week}`) || null;
        const fp = computeFantasyPoints(row.stats, multipliers);
        const vol = volumeScoreForRow(row.position, row, sn);
        const efficiency = vol > 0 ? fp / vol : 0;

        const key = sleeper.sleeperId;
        if (!bySleeper.has(key)) {
            bySleeper.set(key, {
                sleeper,
                position: sleeper.position || row.position,
                team: sleeper.team || row.team,
                games: []
            });
        }
        bySleeper.get(key).games.push({
            season: row.season,
            week: row.week,
            opponent: row.opponent,
            fantasyPoints: fp,
            volume: vol,
            efficiency,
            snaps: sn ? sn.offSnaps : 0,
            snapPct: sn ? sn.offPct : 0,
            targets: row.stats.targets || 0,
            carries: row.stats.carries || 0,
            attempts: row.stats.attempts || 0
        });
    }

    const summaries = [];
    for (const entry of bySleeper.values()) {
        const games = entry.games
            .sort((a, b) => (a.season - b.season) || (a.week - b.week))
            .slice(-TRAILING_WINDOW);
        const gamesPlayed = games.length;
        if (gamesPlayed === 0) continue;
        const sum = (k) => games.reduce((a, b) => a + (b[k] || 0), 0);
        const avg = (k) => sum(k) / gamesPlayed;

        summaries.push({
            sleeperId: entry.sleeper.sleeperId,
            name: entry.sleeper.name,
            position: entry.position,
            team: entry.team,
            sleeper: entry.sleeper,
            window: { games: gamesPlayed, target: TRAILING_WINDOW },
            avg: {
                fantasyPoints: avg('fantasyPoints'),
                volume: avg('volume'),
                efficiency: avg('efficiency'),
                snaps: avg('snaps'),
                snapPct: avg('snapPct'),
                targets: avg('targets'),
                carries: avg('carries'),
                attempts: avg('attempts')
            },
            games
        });
    }
    return summaries;
}

function ratePosition(positionSummaries) {
    const valid = positionSummaries.filter(p => p.window.games >= MIN_GAMES);
    if (valid.length === 0) return new Map();

    const scoring = valid.map(p => p.avg.fantasyPoints);
    const volume = valid.map(p => p.avg.volume);
    const efficiency = valid.map(p => p.avg.efficiency);
    const sStat = meanStd(scoring);
    const vStat = meanStd(volume);
    const eStat = meanStd(efficiency);

    const weights = POSITION_WEIGHTS[valid[0].position] || POSITION_WEIGHTS.WR;
    const composites = valid.map(p => {
        const z = weights.scoring * zscore(p.avg.fantasyPoints, sStat)
                + weights.volume * zscore(p.avg.volume, vStat)
                + weights.efficiency * zscore(p.avg.efficiency, eStat);
        return { id: p.sleeperId, z };
    });
    const zs = composites.map(c => c.z);

    const out = new Map();
    for (const p of valid) {
        const composite = composites.find(c => c.id === p.sleeperId).z;
        const pct = percentileRank(zs, composite);
        const rawRating = 60 + 38 * pct;

        const drivers = [];
        const scoringPct = percentileRank(scoring, p.avg.fantasyPoints);
        const volumePct = percentileRank(volume, p.avg.volume);
        const effPct = percentileRank(efficiency, p.avg.efficiency);
        const sd = topPercentDriver(scoringPct, 'fantasy scoring');
        const vd = topPercentDriver(volumePct, 'opportunity');
        const ed = topPercentDriver(effPct, 'efficiency');
        if (sd) drivers.push(sd);
        if (vd) drivers.push(vd);
        if (ed) drivers.push(ed);
        if (drivers.length === 0) drivers.push(`Avg ${p.avg.fantasyPoints.toFixed(1)} pts/g over last ${p.window.games}`);

        out.set(p.sleeperId, {
            rawRating,
            percentile: pct,
            scoringPct,
            volumePct,
            efficiencyPct: effPct,
            drivers
        });
    }
    return out;
}

function confidenceFromGames(games) {
    if (games <= 0) return 0;
    if (games >= TRAILING_WINDOW) return 1;
    return Math.max(0.2, games / TRAILING_WINDOW);
}

function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
}

/**
 * Top-level compute. Returns `{ table: Map<sleeperId, RatingObject>, asOf, scoring }`
 * with one entry per fantasy-position player that has at least MIN_GAMES games
 * in the trailing window. Players outside that pool are intentionally absent;
 * callers should render `--` when missing.
 */
function computeRatings({ stats, snaps, sleeperPlayers, scoring, scoringLabel, asOf }) {
    const summaries = buildPlayerSummaries(stats, snaps, sleeperPlayers, scoring);
    const byPosition = { QB: [], RB: [], WR: [], TE: [] };
    for (const s of summaries) {
        if (byPosition[s.position]) byPosition[s.position].push(s);
    }

    const table = new Map();
    for (const pos of Object.keys(byPosition)) {
        const ratings = ratePosition(byPosition[pos]);
        for (const s of byPosition[pos]) {
            const r = ratings.get(s.sleeperId);
            if (!r) {
                table.set(s.sleeperId, makeBelowMinEntry(s, asOf, scoringLabel));
                continue;
            }
            const avail = availabilityFactor(s.sleeper);
            const rating = clamp(Math.round(r.rawRating * avail.factor * 10) / 10, 50, 99);
            const drivers = [...r.drivers, ...avail.drivers];
            table.set(s.sleeperId, {
                player_id: s.sleeperId,
                name: s.name,
                position: s.position,
                team: s.team,
                rating,
                rawRating: Math.round(r.rawRating * 10) / 10,
                confidence: confidenceFromGames(s.window.games),
                games: s.window.games,
                window: s.window.target,
                avgFantasyPoints: Math.round(s.avg.fantasyPoints * 100) / 100,
                drivers,
                availabilityFactor: avail.factor,
                scoring: scoringLabel,
                asOf
            });
        }
    }
    return { table, asOf, scoring: scoringLabel };
}

function makeBelowMinEntry(summary, asOf, scoringLabel) {
    return {
        player_id: summary.sleeperId,
        name: summary.name,
        position: summary.position,
        team: summary.team,
        rating: null,
        rawRating: null,
        confidence: confidenceFromGames(summary.window.games),
        games: summary.window.games,
        window: summary.window.target,
        avgFantasyPoints: Math.round((summary.avg.fantasyPoints || 0) * 100) / 100,
        drivers: [`Only ${summary.window.games} qualifying game${summary.window.games === 1 ? '' : 's'} (need ${MIN_GAMES}+)`],
        availabilityFactor: 1,
        scoring: scoringLabel,
        asOf
    };
}

module.exports = {
    computeRatings,
    buildPlayerSummaries,
    ratePosition,
    availabilityFactor,
    confidenceFromGames,
    POSITION_WEIGHTS,
    TRAILING_WINDOW,
    MIN_GAMES
};
