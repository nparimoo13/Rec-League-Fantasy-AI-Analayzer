/**
 * Production backend: keeps your OpenAI API key on the server.
 * Users never see or enter a key; all AI requests go through this proxy.
 *
 * 1. Copy .env.example to .env and set OPENAI_API_KEY=sk-your-key (or OPEN_API_KEY)
 * 2. Run: npm install && node server.js  (or: npx vercel dev)
 * 3. Open http://localhost:3000 (or your deployed URL)
 * Deploy: connect this repo to Vercel. Static files live in public/; the API is this Express app.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { buildContext, formatContextBlock } = require('./lib/context');
const rss = require('./lib/context/rss');
const ratings = require('./lib/ratings');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Use OPENAI_MODEL in .env for a different model (e.g. gpt-4o, gpt-4-turbo, or a fine-tuned/custom model ID)
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

app.use(express.json());
// Local/dev: Vercel production serves public/ via the CDN; express.static is ignored there (see Vercel Express docs)
app.use(express.static(path.join(__dirname, 'public')));

if (!OPENAI_API_KEY) {
    console.warn('Warning: Set OPENAI_API_KEY or OPEN_API_KEY in .env. Analyze Trade and Analyze Team will return 503.');
} else {
    console.log('OpenAI key loaded from .env — Analyze Trade & Analyze Team will use it.');
}

async function buildContextSafely(players) {
    try {
        return await buildContext(players);
    } catch (e) {
        console.warn('context: build failed, continuing without it:', e.message);
        return {
            contextText: '',
            sources: [],
            contextAsOf: new Date().toISOString(),
            disclaimer: 'No real-time context was available; analysis is based on submitted player data only.'
        };
    }
}

async function callOpenAI(payload) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${text}`);
    }
    return response.json();
}

function normalizeAnalysisList(value) {
    if (Array.isArray(value)) {
        return value.map(item => String(item || '').trim()).filter(Boolean);
    }
    const text = String(value || '').replace(/\r/g, '').trim();
    if (!text) return [];

    const bulletParts = text
        .split(/\n+|(?:^|\s)[-*•]\s+/)
        .map(part => part.trim())
        .filter(Boolean);
    if (bulletParts.length > 1) return bulletParts;

    return text
        .split(/,\s+(?=[A-Z0-9])|;\s+|\.\s+(?=[A-Z])/)
        .map(part => part.trim().replace(/\.$/, ''))
        .filter(Boolean);
}

app.post('/api/analyze-trade', async (req, res) => {
    if (!OPENAI_API_KEY) {
        return res.status(503).json({ error: 'Server OpenAI key not configured.' });
    }
    try {
        const { givingPlayers, receivingPlayers, model } = req.body;
        const allPlayers = [...(givingPlayers || []), ...(receivingPlayers || [])];
        const ctx = await buildContextSafely(allPlayers);
        const contextBlock = formatContextBlock(ctx);

        const messages = [
            {
                role: 'system',
                content:
                    'You are an expert fantasy football trade analyst. Given players involved in a trade, ' +
                    "you evaluate it strictly from the perspective of the user's team. " +
                    'Respond with concise, actionable insight. ' +
                    'Use the CURRENT CONTEXT block (when present) for time-sensitive facts; if a fact is not in the context, say so plainly rather than guessing.'
            }
        ];
        if (contextBlock) {
            messages.push({ role: 'system', content: contextBlock });
        }
        messages.push({
            role: 'user',
            content:
                'You are analyzing a fantasy football trade. ' +
                'The players my team is GIVING and RECEIVING are provided below as JSON. ' +
                'Each player has name, position, and a numeric rating (higher is better).\n\n' +
                'GIVING:\n' +
                JSON.stringify(givingPlayers || [], null, 2) +
                '\n\nRECEIVING:\n' +
                JSON.stringify(receivingPlayers || [], null, 2) +
                '\n\n' +
                'Return ONLY a JSON object (no extra text) with this shape:\n' +
                '{\n  "fairness": "Favorable" | "Fair" | "Unfavorable",\n  "grade": number,\n  "summary": string\n}'
        });

        const data = await callOpenAI({ model: model || OPENAI_MODEL, temperature: 0.4, messages });
        const content = data?.choices?.[0]?.message?.content || '';
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            parsed = { fairness: 'Fair', grade: 50, summary: content };
        }
        res.json({
            fairness: parsed.fairness || 'Fair',
            grade: typeof parsed.grade === 'number' ? parsed.grade : 50,
            summary: parsed.summary || '',
            contextAsOf: ctx.contextAsOf,
            sources: ctx.sources,
            disclaimer: ctx.disclaimer
        });
    } catch (err) {
        console.error('analyze-trade error:', err);
        res.status(500).json({ error: err.message || 'Trade analysis failed.' });
    }
});

app.post('/api/analyze-team', async (req, res) => {
    if (!OPENAI_API_KEY) {
        return res.status(503).json({ error: 'Server OpenAI key not configured.' });
    }
    try {
        const { lineupPlayers, benchPlayers, model } = req.body;
        const allPlayers = [...(lineupPlayers || []), ...(benchPlayers || [])];
        const ctx = await buildContextSafely(allPlayers);
        const contextBlock = formatContextBlock(ctx);

        const messages = [
            {
                role: 'system',
                content:
                    'You are an expert fantasy football analyst. Given a starting lineup and bench, ' +
                    'you provide actionable advice. Respond with valid JSON only. ' +
                    'Use the CURRENT CONTEXT block (when present) for time-sensitive facts; if a fact is not in the context, say so plainly rather than guessing.'
            }
        ];
        if (contextBlock) {
            messages.push({ role: 'system', content: contextBlock });
        }
        messages.push({
            role: 'user',
            content:
                'Analyze this fantasy football roster.\n\nSTARTING LINEUP:\n' +
                JSON.stringify(lineupPlayers || [], null, 2) +
                '\n\nBENCH:\n' +
                JSON.stringify(benchPlayers || [], null, 2) +
                '\n\nReturn ONLY a JSON object with this exact shape:\n' +
                '{\n' +
                '  "strengths": string[],\n' +
                '  "weaknesses": string[],\n' +
                '  "tradeTargets": string[],\n' +
                '  "tradeAway": string[],\n' +
                '  "dropCandidates": string[],\n' +
                '  "overallSummary": string,\n' +
                '  "nextActions": string[]\n' +
                '}\n\n' +
                'Rules:\n' +
                '- Each array (except the summary field) should contain 3 to 5 short, scannable bullet-style items, not paragraphs.\n' +
                '- Keep every item concise and specific.\n' +
                '- "overallSummary" must be 2 to 4 sentences: high-level roster overview (strength/weakness theme) in plain language.\n' +
                '- "nextActions" must be 3 to 6 short imperative items the manager should do this week (e.g. start/sit, waiver adds, trade talks, who to cut). No duplication of the bullet lists; focus on decisions and priorities.\n' +
                '- Return valid JSON only. No markdown, no code fences, no extra text.'
        });

        const data = await callOpenAI({ model: model || OPENAI_MODEL, temperature: 0.4, messages });
        const content = (data?.choices?.[0]?.message?.content || '').replace(/^```json?\s*|\s*```$/g, '').trim();
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            parsed = {
                strengths: [],
                weaknesses: [],
                tradeTargets: [],
                tradeAway: [],
                dropCandidates: [],
                overallSummary: String(content || '').trim(),
                nextActions: []
            };
        }
        const strengths = normalizeAnalysisList(parsed.strengths);
        const weaknesses = normalizeAnalysisList(parsed.weaknesses ?? parsed.needsHelp);
        const tradeTargets = normalizeAnalysisList(parsed.tradeTargets);
        const tradeAway = normalizeAnalysisList(parsed.tradeAway);
        const dropCandidates = normalizeAnalysisList(parsed.dropCandidates);
        const nextActions = normalizeAnalysisList(parsed.nextActions);
        const overallSummary = String(parsed.overallSummary || '').trim();
        res.json({
            strengths,
            weaknesses,
            needsHelp: weaknesses,
            tradeTargets,
            tradeAway,
            dropCandidates,
            overallSummary,
            nextActions,
            contextAsOf: ctx.contextAsOf,
            sources: ctx.sources,
            disclaimer: ctx.disclaimer
        });
    } catch (err) {
        console.error('analyze-team error:', err);
        res.status(500).json({ error: err.message || 'Team analysis failed.' });
    }
});

function parsePlayerHandlesQuery(req) {
    const handles = [];
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const id of ids) handles.push({ sleeperId: id, id });

    const namesRaw = String(req.query.names || '').trim();
    if (namesRaw) {
        for (const part of namesRaw.split('|')) {
            const [name, team] = part.split('@').map(s => (s || '').trim());
            if (name) handles.push({ name, team: team || '' });
        }
    }

    if (Array.isArray(req.body?.players)) {
        for (const p of req.body.players) {
            if (!p) continue;
            handles.push({
                sleeperId: p.sleeperId || (p.id != null ? String(p.id) : null),
                id: p.id != null ? String(p.id) : null,
                gsisId: p.gsisId || p.gsis_id || null,
                espnId: p.espnId || p.espn_id || null,
                name: p.name || p.full_name || '',
                team: p.team || ''
            });
        }
    }
    return handles;
}

function isLocalhostRequest(req) {
    const ip = (req.ip || req.connection?.remoteAddress || '').replace('::ffff:', '');
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

async function handleRatingRequest(req, res) {
    try {
        const handles = parsePlayerHandlesQuery(req);
        if (handles.length === 0) {
            return res.status(400).json({ error: 'Provide ids=<csv>, names=Name@TEAM|..., or POST {players:[]}' });
        }
        const scoring = String(req.query.scoring || (req.body && req.body.scoring) || 'full-ppr');
        const result = await ratings.getRatings({ players: handles, scoring });
        res.json({
            asOf: result.asOf,
            scoring: result.scoring,
            tableSize: result.size,
            ratings: result.ratings
        });
    } catch (err) {
        console.error('rating error:', err);
        res.status(500).json({ error: err.message || 'Rating lookup failed.' });
    }
}

app.get('/api/players/rating', handleRatingRequest);
app.post('/api/players/rating', handleRatingRequest);

app.post('/api/players/rating/refresh', async (req, res) => {
    const token = process.env.RATINGS_REFRESH_TOKEN || '';
    const provided = String(req.headers['x-refresh-token'] || req.query.token || '');
    if (token) {
        if (provided !== token) return res.status(401).json({ error: 'Invalid token' });
    } else if (!isLocalhostRequest(req)) {
        return res.status(403).json({ error: 'Refresh restricted to localhost (set RATINGS_REFRESH_TOKEN to expose)' });
    }
    try {
        const scorings = req.body?.scorings || ['full-ppr', 'half-ppr', 'no-ppr'];
        const out = await ratings.refreshAll(scorings);
        res.json(out);
    } catch (err) {
        console.error('rating refresh error:', err);
        res.status(500).json({ error: err.message || 'Rating refresh failed.' });
    }
});

module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        if (!OPENAI_API_KEY) console.warn('Set OPENAI_API_KEY in .env for AI features.');
        const intervalMin = parseInt(process.env.RSS_REFRESH_INTERVAL_MIN || '180', 10);
        if (intervalMin > 0 && process.env.RSS_DISABLE !== '1') {
            console.log(`RSS poller starting (every ${intervalMin} min).`);
            rss.startPoller({ intervalMinutes: intervalMin });
        }

        const ratingsHours = parseInt(process.env.RATINGS_REFRESH_INTERVAL_HOURS || '24', 10);
        if (ratingsHours > 0 && process.env.RATINGS_DISABLE !== '1') {
            console.log(`Ratings refresh starting (every ${ratingsHours}h).`);
            ratings.startPoller({ intervalHours: ratingsHours });
        }
    });
}
