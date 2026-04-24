const rss = require('./rss');
const espn = require('./structured-espn');
const search = require('./search');

const DEFAULT_CHAR_BUDGET = 3500;
const DEFAULT_PER_PLAYER_ITEMS = 3;
const DEFAULT_RSS_MAX_AGE_HOURS = 4;

function envInt(name, fallback) {
    const v = parseInt(process.env[name] || '', 10);
    return Number.isFinite(v) && v > 0 ? v : fallback;
}

function uniqPlayers(players) {
    const seen = new Set();
    const out = [];
    for (const p of (players || [])) {
        const name = String(p?.name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            name,
            position: p?.position || '',
            team: p?.team || ''
        });
    }
    return out;
}

function summarizeStructured(player, struct) {
    const parts = [];
    const pos = struct?.position || player.position;
    const team = struct?.team || player.team;
    if (pos || team) parts.push(`${pos || '-'} on ${team || '-'}`);
    if (struct?.status) parts.push(`status: ${struct.status}`);
    if (struct?.injury) {
        const inj = struct.injury;
        const injStr = inj.status ? `injury: ${inj.status}${inj.detail ? ` (${inj.detail.slice(0, 140)})` : ''}` : '';
        if (injStr) parts.push(injStr);
    }
    return parts.length > 0 ? parts.join('; ') : 'no structured data on file';
}

function formatNewsLine(item) {
    const date = item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : 'undated';
    const src = item.source || 'news';
    const title = (item.title || '').slice(0, 180);
    const excerpt = (item.excerpt || '').slice(0, 220);
    return `    - [${date} | ${src}] ${title}${excerpt ? ` — ${excerpt}` : ''}`;
}

function pushSource(seen, sources, kind, item) {
    const url = (item.link || item.url || '').trim();
    if (!url) return;
    const key = url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({
        title: (item.title || '').trim(),
        url,
        publishedAt: item.publishedAt || null,
        kind
    });
}

/**
 * Build a context pack for a list of players. Returns:
 *   { contextText, sources, contextAsOf, summary, disclaimer }
 *
 * - `contextText` is a single string ready to inject into the user/system prompt.
 * - `sources` is what the UI should render (de-duped by URL).
 * - `contextAsOf` is the freshest signal we relied on (max of "now" and any
 *   included item's publishedAt).
 */
async function buildContext(players, opts = {}) {
    const charBudget = opts.charBudget || envInt('CONTEXT_CHAR_BUDGET', DEFAULT_CHAR_BUDGET);
    const perPlayerItems = opts.perPlayerItems || envInt('CONTEXT_ITEMS_PER_PLAYER', DEFAULT_PER_PLAYER_ITEMS);
    const allowSearch = opts.allowSearch !== false;
    const rssMaxAgeMs = (opts.rssMaxAgeHours || envInt('RSS_MAX_AGE_HOURS', DEFAULT_RSS_MAX_AGE_HOURS)) * 60 * 60 * 1000;

    const list = uniqPlayers(players);
    const empty = {
        contextText: '',
        sources: [],
        contextAsOf: new Date().toISOString(),
        summary: { players: 0, structuredHits: 0, rssHits: 0, searchHits: 0, rssLastSync: null, searchEnabled: search.isEnabled() },
        disclaimer: 'No real-time context was available; analysis is based on submitted player data only.'
    };
    if (list.length === 0) return empty;

    let structuredList = [];
    try {
        structuredList = await espn.getStructuredForPlayers(list.map(p => p.name));
    } catch (e) {
        console.warn('context: structured lookup failed:', e.message);
    }

    try { await rss.refreshIfStale(rssMaxAgeMs); } catch (_e) { /* swallow; we still try cached */ }
    const rssData = rss.getCached();

    const sources = [];
    const seen = new Set();
    const blocks = [];
    let summary = { players: list.length, structuredHits: 0, rssHits: 0, searchHits: 0, rssLastSync: rssData.lastSync, searchEnabled: search.isEnabled() };
    let newest = 0;

    for (let i = 0; i < list.length; i++) {
        const player = list[i];
        const struct = structuredList[i] || null;
        if (struct) summary.structuredHits++;

        if (struct?.sourceUrl) {
            pushSource(seen, sources, 'structured', { title: `${player.name} — ESPN profile`, link: struct.sourceUrl, publishedAt: null });
        }

        const teamHint = struct?.team || player.team || '';
        let news = rss.findItemsForPlayer(player.name, { teamAbbr: teamHint, limit: perPlayerItems, items: rssData.items });
        let newsKind = 'rss';
        if (news.length > 0) summary.rssHits += news.length;

        if (news.length === 0 && allowSearch && search.isEnabled()) {
            try {
                const found = await search.searchSnippets(`"${player.name}" NFL injury OR news`);
                news = found.slice(0, perPlayerItems);
                newsKind = 'search';
                if (news.length > 0) summary.searchHits += news.length;
            } catch (_e) { /* ignore */ }
        }

        for (const it of news) {
            pushSource(seen, sources, newsKind, it);
            const t = Date.parse(it.publishedAt || '');
            if (Number.isFinite(t)) newest = Math.max(newest, t);
        }

        const block = [];
        block.push(`- ${player.name} (${player.position || (struct?.position || '-')}/${player.team || (struct?.team || '-')})`);
        block.push(`    facts: ${summarizeStructured(player, struct)}`);
        if (news.length > 0) {
            block.push('    recent:');
            for (const it of news) block.push(formatNewsLine(it));
        } else {
            block.push('    recent: (no recent items in cached feeds)');
        }
        blocks.push(block.join('\n'));
    }

    let contextText = blocks.join('\n');
    if (contextText.length > charBudget) {
        contextText = contextText.slice(0, charBudget - 4).trimEnd() + ' ...';
    }

    const contextAsOf = newest > 0 ? new Date(newest).toISOString() : new Date().toISOString();
    const disclaimer = (summary.structuredHits + summary.rssHits + summary.searchHits) > 0
        ? 'Context reflects only the cited sources below; treat as a snapshot, not real-time data.'
        : 'No real-time context was available; analysis is based on submitted player data only.';

    return { contextText, sources, contextAsOf, summary, disclaimer };
}

function formatContextBlock(pack) {
    if (!pack || !pack.contextText) return '';
    return [
        'CURRENT CONTEXT (use these facts; if missing, say "no recent reporting available"):',
        `as_of: ${pack.contextAsOf}`,
        pack.contextText
    ].join('\n');
}

module.exports = {
    buildContext,
    formatContextBlock
};
