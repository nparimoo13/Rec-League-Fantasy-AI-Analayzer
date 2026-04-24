const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { FileCache } = require('../cache/file-cache');

const FEED_CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'rss-feeds.json');
const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'cache', 'rss.json');

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true
});

const cache = new FileCache(CACHE_PATH);
let pollerHandle = null;

function loadFeedConfig() {
    try {
        const envFeeds = (process.env.RSS_FEED_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
        if (envFeeds.length > 0) {
            return envFeeds.map(url => ({ name: hostFromUrl(url), url }));
        }
        const raw = fs.readFileSync(FEED_CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.feeds) ? parsed.feeds : [];
    } catch (e) {
        console.warn('rss: failed to load feed config:', e.message);
        return [];
    }
}

function hostFromUrl(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_e) { return url; }
}

function stripHtml(text) {
    return String(text || '')
        .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function pickFirst(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function parseDate(value) {
    if (!value) return null;
    const v = typeof value === 'string' ? value : (value['#text'] || '');
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Normalize a parsed RSS 2.0 / Atom document to a flat list of items.
 */
function normalizeFeed(parsed, sourceName, sourceUrl) {
    const items = [];
    const channel = parsed?.rss?.channel;
    if (channel) {
        const channelTitle = stripHtml(channel.title);
        const rssItems = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
        for (const it of rssItems) {
            const link = typeof it.link === 'string' ? it.link : (it.link?.['@_href'] || it.link?.['#text'] || '');
            items.push({
                title: stripHtml(pickFirst(it.title)),
                link: String(link || '').trim(),
                excerpt: stripHtml(pickFirst(it.description) || pickFirst(it['content:encoded']) || ''),
                publishedAt: parseDate(it.pubDate || it['dc:date'] || it.date),
                source: sourceName || channelTitle || hostFromUrl(sourceUrl)
            });
        }
        return items;
    }
    const feed = parsed?.feed;
    if (feed) {
        const feedTitle = stripHtml(feed.title);
        const entries = Array.isArray(feed.entry) ? feed.entry : (feed.entry ? [feed.entry] : []);
        for (const e of entries) {
            let link = '';
            if (Array.isArray(e.link)) {
                const alt = e.link.find(l => l?.['@_rel'] === 'alternate') || e.link[0];
                link = alt?.['@_href'] || '';
            } else if (e.link) {
                link = e.link['@_href'] || (typeof e.link === 'string' ? e.link : '');
            }
            items.push({
                title: stripHtml(pickFirst(e.title)),
                link: String(link || '').trim(),
                excerpt: stripHtml(pickFirst(e.summary) || pickFirst(e.content) || ''),
                publishedAt: parseDate(e.updated || e.published),
                source: sourceName || feedTitle || hostFromUrl(sourceUrl)
            });
        }
    }
    return items;
}

async function fetchAndParseFeed(feed, { timeoutMs = 8000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(feed.url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'RecLeagueFantasyAI/1.0 (+rss)',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8'
            }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const parsed = xmlParser.parse(xml);
        return normalizeFeed(parsed, feed.name, feed.url);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Pull every configured feed (in parallel), dedupe by URL, sort newest first,
 * cap excerpt length, and persist with a `lastSync` timestamp.
 */
async function refreshAll({ maxItemsPerFeed = 60, excerptCharCap = 600 } = {}) {
    const feeds = loadFeedConfig();
    if (feeds.length === 0) return { items: [], lastSync: null, feeds: [] };

    const results = await Promise.allSettled(feeds.map(f => fetchAndParseFeed(f)));
    const all = [];
    const perFeed = [];
    results.forEach((r, idx) => {
        const feed = feeds[idx];
        if (r.status === 'fulfilled') {
            const items = r.value
                .filter(it => (it.title && it.title.trim()) || (it.excerpt && it.excerpt.trim()))
                .slice(0, maxItemsPerFeed)
                .map(it => ({
                    ...it,
                    excerpt: (it.excerpt || '').slice(0, excerptCharCap)
                }));
            perFeed.push({ name: feed.name, url: feed.url, count: items.length, ok: true });
            all.push(...items);
        } else {
            perFeed.push({ name: feed.name, url: feed.url, count: 0, ok: false, error: String(r.reason && r.reason.message || r.reason) });
        }
    });

    const seen = new Set();
    const deduped = [];
    for (const it of all) {
        const key = (it.link || it.title || '').trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(it);
    }
    deduped.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

    const payload = { items: deduped, lastSync: new Date().toISOString(), feeds: perFeed };
    cache.set('rss', payload);
    return payload;
}

function getCached() {
    return cache.get('rss') || { items: [], lastSync: null, feeds: [] };
}

function isStale(maxAgeMs) {
    const data = getCached();
    if (!data.lastSync) return true;
    return (Date.now() - new Date(data.lastSync).getTime()) > maxAgeMs;
}

async function refreshIfStale(maxAgeMs) {
    if (isStale(maxAgeMs)) {
        try { await refreshAll(); } catch (e) { console.warn('rss: refresh failed:', e.message); }
    }
}

/**
 * Token-aware-ish player matcher. Looks for the full name as a phrase, plus
 * a stricter "first + last" check to avoid generic-name false positives.
 */
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNameRegex(fullName) {
    const cleaned = String(fullName || '').replace(/[.,'`]/g, '').trim();
    if (!cleaned) return null;
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
        return new RegExp(`\\b${escapeRegex(parts[0])}\\b`, 'i');
    }
    const first = parts[0];
    const last = parts[parts.length - 1];
    return new RegExp(`\\b${escapeRegex(first)}\\b[^\\n]{0,40}\\b${escapeRegex(last)}\\b|\\b${escapeRegex(first)}\\s+${escapeRegex(last)}\\b`, 'i');
}

function findItemsForPlayer(name, { teamAbbr = '', limit = 4, items = null } = {}) {
    const data = items ? { items } : getCached();
    const re = buildNameRegex(name);
    if (!re) return [];
    const teamRe = teamAbbr ? new RegExp(`\\b${escapeRegex(teamAbbr)}\\b`, 'i') : null;
    const matches = [];
    for (const it of data.items) {
        const haystack = `${it.title}\n${it.excerpt}`;
        if (!re.test(haystack)) continue;
        const teamBoost = teamRe && teamRe.test(haystack) ? 1 : 0;
        matches.push({ item: it, score: teamBoost + (it.publishedAt ? 1 : 0) });
    }
    matches.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.item.publishedAt || 0) - new Date(a.item.publishedAt || 0);
    });
    return matches.slice(0, limit).map(m => m.item);
}

function startPoller({ intervalMinutes = 180 } = {}) {
    stopPoller();
    const ms = Math.max(15, intervalMinutes) * 60 * 1000;
    refreshAll().catch(e => console.warn('rss: initial refresh failed:', e.message));
    pollerHandle = setInterval(() => {
        refreshAll().catch(e => console.warn('rss: scheduled refresh failed:', e.message));
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
    loadFeedConfig,
    refreshAll,
    refreshIfStale,
    isStale,
    getCached,
    findItemsForPlayer,
    startPoller,
    stopPoller
};
