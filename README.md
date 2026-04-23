# Rec-League-Fantasy-AI-Analayzer
Fantasy Football AI Analyzing Platform

## Using your OpenAI API key in production (for paying users)

So that **users never see or enter an API key**, run the app with the included backend. Your key stays on the server only.

1. **Store the key in a `.env` file (never in code or git):**
   - Copy `.env.example` to `.env`
   - Set `OPENAI_API_KEY=sk-your-actual-key` in `.env`
   - `.env` is in `.gitignore`; do not commit it.

2. **Run the server (serves the app + AI proxy):**
   ```bash
   npm install
   node server.js
   ```
   Open **http://localhost:3000** (not as a file). **Analyze Trade** and **Analyze Team** use the key from `.env`; no user prompt. Optionally set `OPENAI_MODEL=gpt-4o` (or another model ID) in `.env` to use a different model.

3. **Deploying:**  
   Deploy `server.js` and your static files to your host. Set `OPENAI_API_KEY` in the host’s environment (e.g. Railway, Heroku, Render env vars). If the frontend is on a different domain, set `window.APP_API_URL = 'https://your-api-domain.com'` before loading the app so the frontend calls your API URL...
