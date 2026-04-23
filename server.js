/**
 * Production backend: keeps your OpenAI API key on the server.
 * Users never see or enter a key; all AI requests go through this proxy.
 *
 * 1. Copy .env.example to .env and set OPENAI_API_KEY=sk-your-key
 * 2. Run: npm install && node server.js  (or: npx vercel dev)
 * 3. Open http://localhost:3000 (or your deployed URL)
 * Deploy: connect this repo to Vercel. Static files live in public/; the API is this Express app.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Use OPENAI_MODEL in .env for a different model (e.g. gpt-4o, gpt-4-turbo, or a fine-tuned/custom model ID)
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

app.use(express.json());
// Local/dev: Vercel production serves public/ via the CDN; express.static is ignored there (see Vercel Express docs)
app.use(express.static(path.join(__dirname, 'public')));

if (!OPENAI_API_KEY) {
    console.warn('Warning: OPENAI_API_KEY is not set in .env. Analyze Trade and Analyze Team will return 503.');
} else {
    console.log('OpenAI key loaded from .env — Analyze Trade & Analyze Team will use it.');
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

app.post('/api/analyze-trade', async (req, res) => {
    if (!OPENAI_API_KEY) {
        return res.status(503).json({ error: 'Server OpenAI key not configured.' });
    }
    try {
        const { givingPlayers, receivingPlayers, model } = req.body;
        const payload = {
            model: model || OPENAI_MODEL,
            temperature: 0.4,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are an expert fantasy football trade analyst. Given players involved in a trade, ' +
                        "you evaluate it strictly from the perspective of the user's team. " +
                        'Respond with concise, actionable insight.'
                },
                {
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
                }
            ]
        };
        const data = await callOpenAI(payload);
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
            summary: parsed.summary || ''
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
        const payload = {
            model: model || OPENAI_MODEL,
            temperature: 0.4,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are an expert fantasy football analyst. Given a starting lineup and bench, ' +
                        'you provide actionable advice. Respond with valid JSON only.'
                },
                {
                    role: 'user',
                    content:
                        'Analyze this fantasy football roster.\n\nSTARTING LINEUP:\n' +
                        JSON.stringify(lineupPlayers || [], null, 2) +
                        '\n\nBENCH:\n' +
                        JSON.stringify(benchPlayers || [], null, 2) +
                        '\n\nReturn ONLY a JSON object with: "strengths", "needsHelp", "tradeTargets", "tradeAway", "dropCandidates" (each a string).'
                }
            ]
        };
        const data = await callOpenAI(payload);
        const content = (data?.choices?.[0]?.message?.content || '').replace(/^```json?\s*|\s*```$/g, '').trim();
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            parsed = { strengths: '', needsHelp: content, tradeTargets: '', tradeAway: '', dropCandidates: '' };
        }
        res.json({
            strengths: parsed.strengths || '',
            needsHelp: parsed.needsHelp || '',
            tradeTargets: parsed.tradeTargets || '',
            tradeAway: parsed.tradeAway || '',
            dropCandidates: parsed.dropCandidates || ''
        });
    } catch (err) {
        console.error('analyze-team error:', err);
        res.status(500).json({ error: err.message || 'Team analysis failed.' });
    }
});

module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        if (!OPENAI_API_KEY) console.warn('Set OPENAI_API_KEY in .env for AI features.');
    });
}
