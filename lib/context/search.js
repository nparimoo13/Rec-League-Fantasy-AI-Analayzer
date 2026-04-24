const path = require('path');
const { FileCache } = require('../cache/file-cache');

const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'cache', 'search.json');
const cache = new FileCache(CACHE_PATH);

const QUERY_TTL_MS = 12 * 60 * 60 * 1000;

function provider() {
    return (process.env.SEARCH_PROVIDER || '').toLowerCase();
}

function dailyCap() {
    const v = parseInt(process.env.SEARCH_DAILY_CAP || '50', 10);
    return Number.isFinite(v) && v > 0 ? v : 50;
}

function isEnabled() {
    if (provider() !== 'google') return false;
    return Boolean(process.env.GOOGLE_PSE_API_KEY && process.env.GOOGLE_PSE_CX);
}

function todayKey() {
    return 'usage:' + new Date().toISOString().slice(0, 10);
}

function readUsage() {
    return Number(cache.get(todayKey()) || 0);
}

function bumpUsage() {
    const next = readUsage() + 1;
    cache.set(todayKey(), next, 36 * 60 * 60 * 1000);
    return next;
}

async function googleSearch(query) {
    const key = process.env.GOOGLE_PSE_API_KEY;
    const cx = process.env.GOOGLE_PSE_CX;
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&num=3&q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        return items.map(it => ({
            title: String(it.title || '').trim(),
            link: String(it.link || '').trim(),
            excerpt: String(it.snippet || '').trim(),
            publishedAt: it.pagemap?.metatags?.[0]?.['article:published_time'] || null,
            source: 'web search'
        })).filter(it => it.link);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Cache-first search with strict daily cap. Returns [] if disabled or cap hit.
 */
async function searchSnippets(query) {
    if (!isEnabled()) return [];
    const cacheKey = `q:${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (readUsage() >= dailyCap()) {
        console.warn('search: daily cap hit, skipping query:', query);
        return [];
    }
    try {
        const results = await googleSearch(query);
        cache.set(cacheKey, results, QUERY_TTL_MS);
        bumpUsage();
        return results;
    } catch (e) {
        console.warn('search: query failed:', e.message);
        return [];
    }
}

module.exports = {
    isEnabled,
    searchSnippets,
    readUsage,
    dailyCap
};
