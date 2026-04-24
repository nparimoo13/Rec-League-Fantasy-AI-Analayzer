// API Controller Class for Fantasy Football Data
// Handles all external API integrations (Sleeper, ESPN, Yahoo, etc.)

class FantasyAPIController {
    constructor() {
        this.baseURL = 'https://api.sleeper.app/v1';
        this.userData = null;
        this.leagueData = null;
        this.openAIModel = 'gpt-5.4-nano';
        // Per-session rating cache keyed by `${scoring}|${id|name}`. Server already
        // does the heavy lifting; this just avoids retransmitting on render churn.
        this._ratingCache = new Map();
        this._ratingInflight = new Map();
    }

    _scoringFromUI() {
        if (typeof window !== 'undefined' && typeof window.currentScoring === 'function') {
            try { return window.currentScoring(); } catch (_e) { /* fall through */ }
        }
        if (this.leagueData && (this.leagueData.league_id || this.leagueData.leagueId)) {
            return `league:${this.leagueData.league_id || this.leagueData.leagueId}`;
        }
        const sel = typeof document !== 'undefined' && (document.getElementById('scoringPillSelect') || document.getElementById('scoringFormat'));
        return (sel && sel.value) || 'full-ppr';
    }

    /**
     * Fetch ratings for many players in a single round-trip.
     * `players` items can carry { id|sleeperId, name, team }.
     * Returns a Map keyed by the player's `id` (or normalized name fallback).
     */
    async getPlayerRatings(players, scoring) {
        const list = (players || []).filter(Boolean);
        if (list.length === 0) return new Map();
        const sc = scoring || this._scoringFromUI();
        const apiBase = (typeof window !== 'undefined' && window.APP_API_URL)
            ? String(window.APP_API_URL).replace(/\/$/, '') + '/'
            : '/';

        const result = new Map();
        const toFetch = [];
        for (const p of list) {
            const key = this._ratingCacheKey(sc, p);
            const cached = this._ratingCache.get(key);
            if (cached) {
                result.set(this._playerKey(p), cached);
            } else {
                toFetch.push(p);
            }
        }
        if (toFetch.length === 0) return result;

        try {
            const res = await fetch(apiBase + 'api/players/rating', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scoring: sc, players: toFetch })
            });
            if (!res.ok) throw new Error(`rating HTTP ${res.status}`);
            const body = await res.json();
            const arr = Array.isArray(body.ratings) ? body.ratings : [];
            for (let i = 0; i < toFetch.length; i++) {
                const p = toFetch[i];
                const r = arr[i] || null;
                const key = this._ratingCacheKey(sc, p);
                if (r) this._ratingCache.set(key, r);
                result.set(this._playerKey(p), r);
            }
        } catch (e) {
            console.warn('rating fetch failed:', e.message);
            for (const p of toFetch) result.set(this._playerKey(p), null);
        }
        return result;
    }

    /**
     * Fetch a single player's rating with in-flight de-duping so multiple
     * concurrent renders for the same player don't hammer the server.
     */
    async getPlayerRating(player, scoring) {
        if (!player) return null;
        const sc = scoring || this._scoringFromUI();
        const key = this._ratingCacheKey(sc, player);
        const cached = this._ratingCache.get(key);
        if (cached) return cached;
        if (this._ratingInflight.has(key)) return this._ratingInflight.get(key);

        const promise = this.getPlayerRatings([player], sc).then(map => {
            const r = map.get(this._playerKey(player)) || null;
            this._ratingInflight.delete(key);
            return r;
        }).catch(e => {
            this._ratingInflight.delete(key);
            throw e;
        });
        this._ratingInflight.set(key, promise);
        return promise;
    }

    _playerKey(p) {
        const id = p && (p.sleeperId || p.id);
        if (id != null) return `id:${id}`;
        return `name:${String((p && (p.name || p.full_name)) || '').toLowerCase()}|${String((p && p.team) || '').toUpperCase()}`;
    }

    _ratingCacheKey(scoring, p) {
        return `${scoring}::${this._playerKey(p)}`;
    }

    invalidateRatingCache() {
        this._ratingCache.clear();
        this._ratingInflight.clear();
    }

    // Sleeper API Methods
    async getUserByUsername(username) {
        try {
            const normalized = String(username || '').trim().toLowerCase();
            if (!normalized) throw new Error('Please enter your Sleeper username.');
            const url = `${this.baseURL}/user/${encodeURIComponent(normalized)}`;
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Username not found. Check the spelling (Sleeper usernames are case-insensitive) and try again.');
                }
                throw new Error(`User not found: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching user:', error);
            throw error;
        }
    }

    async getUserLeagues(userId, season = new Date().getFullYear()) {
        try {
            const response = await fetch(`${this.baseURL}/user/${userId}/leagues/nfl/${season}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch leagues: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching user leagues:', error);
            throw error;
        }
    }

    async getLeagueRosters(leagueId) {
        try {
            const response = await fetch(`${this.baseURL}/league/${leagueId}/rosters`);
            if (!response.ok) {
                throw new Error(`Failed to fetch rosters: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching league rosters:', error);
            throw error;
        }
    }

    async getLeagueUsers(leagueId) {
        try {
            const response = await fetch(`${this.baseURL}/league/${leagueId}/users`);
            if (!response.ok) {
                throw new Error(`Failed to fetch league users: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching league users:', error);
            throw error;
        }
    }

    async getPlayers() {
        try {
            const response = await fetch(`${this.baseURL}/players/nfl`);
            if (!response.ok) {
                throw new Error(`Failed to fetch players: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching players:', error);
            throw error;
        }
    }

    // ESPN Fantasy API (undocumented v3; public leagues only without cookies)
    static getESPNPositionName(positionId) {
        const map = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
        return map[positionId] || 'FLEX';
    }

    async fetchESPNLeague(leagueId, season) {
        const year = season || new Date().getFullYear();
        const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${encodeURIComponent(leagueId)}?view=mRoster&view=mTeam&view=mSettings`;
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) throw new Error('League not found. Check the League ID and season.');
            throw new Error(`ESPN request failed: ${response.status}`);
        }
        return await response.json();
    }

    buildESPNRosterAndPlayers(espnLeague, teamId) {
        const team = (espnLeague.teams || []).find(t => String(t.id) === String(teamId));
        if (!team || !team.roster || !team.roster.entries) {
            throw new Error('Team not found in this league.');
        }
        const playersData = {};
        const starters = [];
        const allPlayerIds = [];
        const slotToPosition = { 0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'K', 17: 'DEF', 20: 'FLEX', 23: 'FLEX' };
        for (const entry of team.roster.entries) {
            const pe = entry.playerPoolEntry || entry;
            const p = pe.player || {};
            const pid = String(p.id || pe.playerId || '');
            if (!pid) continue;
            const position = FantasyAPIController.getESPNPositionName(p.defaultPositionId) || 'FLEX';
            const proTeamId = p.proTeamId;
            const teamAbbr = proTeamId != null ? this.espnProTeamIdToAbbr(proTeamId) : '';
            playersData[pid] = {
                player_id: pid,
                id: pid,
                full_name: p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unknown',
                position,
                team: teamAbbr
            };
            allPlayerIds.push(pid);
            const slot = entry.lineupSlotId;
            if (slot !== 21 && slot !== 22) starters.push(pid); // 21=bench, 22=IR
        }
        return {
            roster: { starters, players: allPlayerIds, owner_id: String(teamId) },
            playersData
        };
    }

    espnProTeamIdToAbbr(proTeamId) {
        const map = { 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU' };
        return map[proTeamId] || '';
    }

    async connectESPNByLeagueId(leagueId, season, teamId) {
        try {
            showNotification('Fetching ESPN league...', 'info');
            const espnLeague = await this.fetchESPNLeague(leagueId, season);
            if (!espnLeague.teams || espnLeague.teams.length === 0) {
                throw new Error('No teams found in this league.');
            }
            const teams = espnLeague.teams.map(t => ({
                id: t.id,
                name: [t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`
            }));
            if (!teamId) {
                this._espnPendingLeague = { espnLeague, leagueId, season };
                this.showESPNTeamSelectionModal(teams);
                return;
            }
            this.applyESPNLeagueAndRoster(espnLeague, leagueId, season, teamId);
        } catch (error) {
            console.error('ESPN connection error:', error);
            showNotification(error.message || 'ESPN import failed.', 'warning');
            throw error;
        }
    }

    applyESPNLeagueAndRoster(espnLeague, leagueId, season, teamId) {
        const { roster, playersData } = this.buildESPNRosterAndPlayers(espnLeague, teamId);
        this.userData = { user_id: String(teamId) };
        this.leagueData = {
            name: espnLeague.name || `ESPN League ${leagueId}`,
            league_id: leagueId,
            settings: { dynasty: false, scoring_settings: {} },
            rosters: [roster],
            users: [{ user_id: String(teamId), display_name: (espnLeague.teams.find(t => String(t.id) === String(teamId)) || {}).nickname || `Team ${teamId}` }]
        };
        this.playersData = playersData;
        showNotification(`Connected to ${this.leagueData.name}!`, 'success');
        this.updateUIWithLeagueData();
        this.updateTeamDisplayWithRoster(roster);
        if (typeof updateTeamOverallRating === 'function') {
            try { updateTeamOverallRating(); } catch (e) { console.error(e); }
        }
    }

    showESPNTeamSelectionModal(teams) {
        const modal = document.createElement('div');
        modal.className = 'league-selection-modal espn-team-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-tv"></i> Select Your Team</h3>
                    <p>Choose your team in this league</p>
                </div>
                <div class="modal-body">
                    <div class="leagues-list" id="espnTeamsList">
                        ${teams.map(t => `
                            <div class="league-option" data-team-id="${t.id}">
                                <div class="league-info"><h4>${t.name}</h4></div>
                                <div class="league-select">
                                    <button class="select-league-btn" data-team-id="${t.id}">Select</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-footer"><button class="btn-cancel">Cancel</button></div>
            </div>
        `;
        const style = document.createElement('style');
        style.textContent = `.league-selection-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.league-selection-modal .modal-content { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 0; border-radius: 20px; border: 2px solid #4a9eff; max-width: 500px; width: 90%; }
.league-selection-modal .modal-header { padding: 20px; text-align: center; border-bottom: 1px solid rgba(74,158,255,0.2); }
.league-selection-modal .modal-header h3 { color: #4a9eff; margin: 0 0 8px 0; }
.league-selection-modal .modal-body { padding: 20px; max-height: 60vh; overflow-y: auto; }
.league-option { display: flex; align-items: center; justify-content: space-between; padding: 16px; background: rgba(42,42,74,0.5); border: 2px solid rgba(74,158,255,0.2); border-radius: 12px; margin-bottom: 10px; cursor: pointer; }
.league-option:hover { border-color: #4a9eff; }
.select-league-btn { padding: 8px 16px; background: #4a9eff; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
.btn-cancel { padding: 10px 20px; background: #2a2a4a; color: #b0b0b0; border: 1px solid #4a4a6a; border-radius: 8px; cursor: pointer; }`;
        document.head.appendChild(style);
        document.body.appendChild(modal);
        const pending = this._espnPendingLeague;
        modal.querySelectorAll('.select-league-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const teamId = btn.getAttribute('data-team-id');
                document.body.removeChild(modal);
                document.head.removeChild(style);
                if (pending) this.applyESPNLeagueAndRoster(pending.espnLeague, pending.leagueId, pending.season, teamId);
                this._espnPendingLeague = null;
            });
        });
        modal.querySelector('.btn-cancel').addEventListener('click', () => {
            document.body.removeChild(modal);
            document.head.removeChild(style);
            this._espnPendingLeague = null;
        });
    }

    // Yahoo Fantasy: requires OAuth for league/roster access; offer league ID input and friendly message
    async connectYahooByLeagueId(leagueKey) {
        try {
            showNotification('Checking Yahoo league...', 'info');
            const key = String(leagueKey || '').trim();
            if (!key) throw new Error('Please enter your Yahoo League ID or league key (e.g. nfl.l.12345).');
            const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${encodeURIComponent(key)}`;
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new Error('Yahoo Fantasy requires sign-in. Use ESPN or Sleeper import, or enter your lineup manually.');
                }
                throw new Error('Could not load Yahoo league. Yahoo requires app sign-in for league data.');
            }
            const text = await response.text();
            if (!text || text.includes('Unauthorized') || text.includes('oauth')) {
                throw new Error('Yahoo Fantasy requires sign-in. Use ESPN or Sleeper import, or enter your lineup manually.');
            }
            showNotification('Yahoo league loaded. Full roster import requires Yahoo sign-in.', 'info');
        } catch (error) {
            console.error('Yahoo connection error:', error);
            showNotification(error.message || 'Yahoo import is not available without sign-in.', 'warning');
            throw error;
        }
    }

    // Main integration method
    async connectSleeperAccount(username) {
        try {
            showNotification('Connecting to Sleeper...', 'info');
            
            // Get user data
            this.userData = await this.getUserByUsername(username);
            console.log('User data:', this.userData);
            
            // Get user's leagues: try current year first, then previous (off-season often has no leagues for next year yet)
            const currentYear = new Date().getFullYear();
            let leagues = await this.getUserLeagues(this.userData.user_id, currentYear);
            if (leagues.length === 0 && currentYear > 2018) {
                leagues = await this.getUserLeagues(this.userData.user_id, currentYear - 1);
            }
            if (leagues.length === 0) {
                throw new Error('No leagues found for this user. If it\'s off-season, your leagues may be under the previous season—we already checked this year and last.');
            }
            
            // Store all leagues for user selection
            this.availableLeagues = leagues;
            
            // Show league selection modal
            this.showLeagueSelectionModal(leagues);
            
            return {
                user: this.userData,
                league: this.leagueData
            };
            
        } catch (error) {
            console.error('Sleeper connection error:', error);
            showNotification(`Connection failed: ${error.message}`, 'warning');
            throw error;
        }
    }

    updateUIWithLeagueData() {
        try {
            // Update league settings display
            const leagueName = this.leagueData.name;
            const leagueType = this.leagueData.settings.dynasty ? 'Dynasty' : 'Redraft';
            
            // Safely access scoring settings with fallbacks
            const scoringSettings = this.leagueData.settings?.scoring_settings || {};
            
            // Check for different possible scoring field names
            const recPoints = scoringSettings.rec || scoringSettings.rec_pts || 0;
            const recHalfPoints = scoringSettings.rec_half || scoringSettings.rec_half_pts || 0;
            
            // Also check for PPR in other possible fields
            const ppr = scoringSettings.ppr || scoringSettings.rec_ppr || 0;
            
            // Determine PPR type based on scoring settings
            let pprType = 'no-ppr';
            if (recPoints > 0 || ppr > 0) {
                pprType = 'full-ppr';
            } else if (recHalfPoints > 0) {
                pprType = 'half-ppr';
            }
            
            console.log('Scoring analysis:', {
                recPoints,
                recHalfPoints,
                ppr,
                pprType,
                allScoringSettings: scoringSettings
            });
            
            // Update the manual settings with league data
            const leagueTypeSelect = document.getElementById('leagueType');
            const scoringFormatSelect = document.getElementById('scoringFormat');
            
            if (leagueTypeSelect) {
                leagueTypeSelect.value = leagueType.toLowerCase();
            }
            
            if (scoringFormatSelect) {
                scoringFormatSelect.value = pprType;
            }
            
            // Show success message with league info
            showNotification(`Connected to ${leagueName} (${leagueType})`, 'success');
            
            console.log('League data updated:', {
                name: leagueName,
                type: leagueType,
                ppr: pprType,
                scoringSettings: scoringSettings
            });

            const s = this.leagueData.settings || {};
            const flexEl = document.getElementById('flexSpots');
            const benchEl = document.getElementById('benchSpots');
            const superflexEl = document.getElementById('superflex');
            if (flexEl && s.flex_spots != null) {
                const n = Math.min(8, Math.max(0, parseInt(s.flex_spots, 10)));
                if (!isNaN(n)) flexEl.value = n;
            }
            if (benchEl && s.bench_spots != null) {
                const n = Math.min(10, Math.max(0, parseInt(s.bench_spots, 10)));
                if (!isNaN(n)) benchEl.value = n;
            }
            if (superflexEl && s.super_flex_spots != null) {
                superflexEl.checked = parseInt(s.super_flex_spots, 10) > 0;
            }
            try {
                const settings = {
                    scoringFormat: document.getElementById('scoringFormat')?.value,
                    leagueType: document.getElementById('leagueType')?.value,
                    superflex: superflexEl ? superflexEl.checked : false,
                    benchSpots: benchEl ? parseInt(benchEl.value, 10) : 6,
                    flexSpots: flexEl ? parseInt(flexEl.value, 10) : 1
                };
                if (settings.scoringFormat) localStorage.setItem('leagueSettings', JSON.stringify(settings));
            } catch (e) {}
            
        } catch (error) {
            console.error('Error updating UI with league data:', error);
            showNotification('Connected to Sleeper, but some settings could not be auto-configured', 'warning');
        }
    }

    showLeagueSelectionModal(leagues) {
        // Create league selection modal
        const modal = document.createElement('div');
        modal.className = 'league-selection-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-trophy"></i> Select Your League</h3>
                    <p>Choose which league you'd like to analyze</p>
                </div>
                <div class="modal-body">
                    <div class="leagues-list" id="leaguesList">
                        ${leagues.map((league, index) => `
                            <div class="league-option" data-league-id="${league.league_id}">
                                <div class="league-info">
                                    <h4>${league.name}</h4>
                                    <div class="league-details">
                                        <span class="league-type">${league.settings.dynasty ? 'Dynasty' : 'Redraft'}</span>
                                        <span class="league-season">${league.season}</span>
                                        <span class="league-size">${league.total_rosters} teams</span>
                                    </div>
                                    <div class="league-scoring">
                                        <span class="scoring-info">Scoring: ${this.getScoringDescription(league.settings.scoring_settings)}</span>
                                    </div>
                                </div>
                                <div class="league-select">
                                    <button class="select-league-btn" data-league-id="${league.league_id}">
                                        <i class="fas fa-check"></i>
                                        Select
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel">Cancel</button>
                </div>
            </div>
        `;
        
        // Add modal styles
        const style = document.createElement('style');
        style.textContent = `
            .league-selection-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
                backdrop-filter: blur(5px);
            }
            .league-selection-modal .modal-content {
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                padding: 0;
                border-radius: 20px;
                border: 2px solid #4a9eff;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            .modal-header {
                padding: 30px 30px 20px;
                text-align: center;
                border-bottom: 1px solid rgba(74, 158, 255, 0.2);
            }
            .modal-header h3 {
                color: #4a9eff;
                margin-bottom: 10px;
                font-size: 1.5rem;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            .modal-header p {
                color: #b0b0b0;
                font-size: 1rem;
            }
            .modal-body {
                padding: 20px;
                flex: 1;
                overflow-y: auto;
            }
            .leagues-list {
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            .league-option {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 20px;
                background: rgba(42, 42, 74, 0.5);
                border: 2px solid rgba(74, 158, 255, 0.2);
                border-radius: 12px;
                transition: all 0.3s ease;
                cursor: pointer;
            }
            .league-option:hover {
                border-color: #4a9eff;
                background: rgba(74, 158, 255, 0.1);
                transform: translateY(-2px);
            }
            .league-info h4 {
                color: #ffffff;
                font-size: 1.2rem;
                margin-bottom: 8px;
                font-weight: 600;
            }
            .league-details {
                display: flex;
                gap: 15px;
                margin-bottom: 8px;
                flex-wrap: wrap;
            }
            .league-details span {
                background: rgba(74, 158, 255, 0.2);
                color: #4a9eff;
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 0.8rem;
                font-weight: 500;
            }
            .league-scoring {
                color: #b0b0b0;
                font-size: 0.9rem;
            }
            .select-league-btn {
                background: linear-gradient(135deg, #4a9eff 0%, #6bb6ff 100%);
                color: #1a1a2e;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .select-league-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(74, 158, 255, 0.3);
            }
            .modal-footer {
                padding: 20px 30px;
                border-top: 1px solid rgba(74, 158, 255, 0.2);
                display: flex;
                justify-content: flex-end;
            }
            .btn-cancel {
                background: #2a2a4a;
                color: #b0b0b0;
                border: 1px solid #4a4a6a;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            .btn-cancel:hover {
                background: #3a3a5a;
                color: white;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(modal);
        
        // Add event listeners for league selection
        const leagueOptions = modal.querySelectorAll('.league-option');
        const selectButtons = modal.querySelectorAll('.select-league-btn');
        const cancelBtn = modal.querySelector('.btn-cancel');
        
        // Handle league selection
        selectButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation();
                const leagueId = button.getAttribute('data-league-id');
                const selectedLeague = leagues.find(league => league.league_id === leagueId);
                
                if (selectedLeague) {
                    await this.selectLeague(selectedLeague);
                    document.body.removeChild(modal);
                    document.head.removeChild(style);
                }
            });
        });
        
        // Handle league option clicks
        leagueOptions.forEach(option => {
            option.addEventListener('click', async () => {
                const leagueId = option.getAttribute('data-league-id');
                const selectedLeague = leagues.find(league => league.league_id === leagueId);
                
                if (selectedLeague) {
                    await this.selectLeague(selectedLeague);
                    document.body.removeChild(modal);
                    document.head.removeChild(style);
                }
            });
        });
        
        // Handle cancel
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            document.head.removeChild(style);
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                document.head.removeChild(style);
            }
        });
    }

    getScoringDescription(scoringSettings) {
        if (!scoringSettings) return 'Standard';
        
        const rec = scoringSettings.rec || scoringSettings.rec_pts || 0;
        const recHalf = scoringSettings.rec_half || scoringSettings.rec_half_pts || 0;
        const ppr = scoringSettings.ppr || scoringSettings.rec_ppr || 0;
        
        if (rec > 0 || ppr > 0) {
            return 'Full PPR';
        } else if (recHalf > 0) {
            return 'Half PPR';
        } else {
            return 'Standard';
        }
    }

    /** Sleeper: roster_positions order matches roster.starters order (starting slots only; bench follows). */
    static isSleeperBenchPosition(pos) {
        const u = String(pos || '').toUpperCase();
        return u === 'BN' || u === 'IR' || u === 'IR+' || u === 'RESERVE' || u === 'TAXI';
    }

    /** Starting slots only: roster rows before the first bench slot (order matches roster.starters). */
    static getSleeperStartingSlotList(rosterPositions) {
        if (!Array.isArray(rosterPositions) || rosterPositions.length === 0) return [];
        const firstBn = rosterPositions.findIndex(p => String(p).toUpperCase() === 'BN');
        return firstBn === -1 ? [...rosterPositions] : rosterPositions.slice(0, firstBn);
    }

    /** Map Sleeper slot codes to UI / validation keys (FLEX vs SUPER_FLEX are separate groups). */
    static normalizeSleeperSlotKey(raw) {
        const u = String(raw || '').toUpperCase();
        if (u === 'REC_FLEX' || u === 'WRRB_FLEX' || u === 'R_FLEX') return 'FLEX';
        return u;
    }

    static isSleeperRegularFlexSlot(raw) {
        const k = FantasyAPIController.normalizeSleeperSlotKey(raw);
        return k === 'FLEX';
    }

    static slotKeyToDisplayName(key) {
        const u = String(key || '').toUpperCase();
        if (u === 'SUPER_FLEX') return 'Superflex';
        if (u === 'FLEX') return 'FLEX';
        return u;
    }

    /** Preferred section order for starting lineup (unknown IDP etc. appended after). */
    static SLEEPER_LINEUP_GROUP_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF', 'DL', 'LB', 'DB'];

    async selectLeague(selectedLeague) {
        try {
            showNotification(`Loading ${selectedLeague.name}...`, 'info');
            this.leagueData = selectedLeague;
            if (selectedLeague.roster_positions && Array.isArray(selectedLeague.roster_positions)) {
                this.leagueData.settings = this.leagueData.settings || {};
                const benchCount = selectedLeague.roster_positions.filter(p => String(p).toUpperCase() === 'BN').length;
                if (benchCount > 0) this.leagueData.settings.bench_spots = benchCount;
                const startSlots = FantasyAPIController.getSleeperStartingSlotList(selectedLeague.roster_positions);
                const flexN = startSlots.filter(p => FantasyAPIController.isSleeperRegularFlexSlot(p)).length;
                const superFN = startSlots.filter(p => String(p).toUpperCase() === 'SUPER_FLEX').length;
                this.leagueData.settings.flex_spots = flexN;
                this.leagueData.settings.super_flex_spots = superFN;
            }
            // Get league rosters and users
            const [rosters, users] = await Promise.all([
                this.getLeagueRosters(selectedLeague.league_id),
                this.getLeagueUsers(selectedLeague.league_id)
            ]);
            
            // Store the data
            this.leagueData.rosters = rosters;
            this.leagueData.users = users;
            
            // Debug: Log the league data structure
            console.log('Full league data:', this.leagueData);
            console.log('League settings:', this.leagueData.settings);
            console.log('Scoring settings:', this.leagueData.settings?.scoring_settings);
            
            showNotification(`Successfully connected to ${selectedLeague.name}!`, 'success');
            
            // Update UI with league data
            this.updateUIWithLeagueData();

            try {
                document.dispatchEvent(new CustomEvent('leagueConnected', { detail: { leagueId: selectedLeague.league_id, source: 'sleeper' } }));
            } catch (_e) {}

            // Populate team display with roster data
            this.populateTeamDisplay();
            
        } catch (error) {
            console.error('Error selecting league:', error);
            showNotification(`Failed to load league: ${error.message}`, 'warning');
        }
    }

    async populateTeamDisplay() {
        try {
            if (!this.leagueData || !this.leagueData.rosters || !this.leagueData.users) {
                console.log('No league data available for team population');
                return;
            }

            // Find the user's roster (assuming first roster for now, could be enhanced)
            const userRoster = this.leagueData.rosters.find(roster => 
                roster.owner_id === this.userData.user_id
            );

            if (!userRoster) {
                console.log('User roster not found');
                this.showEmptyTeamDisplay();
                return;
            }

            // Get players data if not already loaded
            if (!this.playersData) {
                this.playersData = await this.getPlayers();
            }

            // Update team display with roster data
            this.updateTeamDisplayWithRoster(userRoster);

        } catch (error) {
            console.error('Error populating team display:', error);
            this.showEmptyTeamDisplay();
        }
    }

    updateTeamDisplayWithRoster(roster) {
        const lineupSection = document.querySelector('.lineup-section');
        const benchSection = document.querySelector('.bench-section');
        
        if (lineupSection) {
            lineupSection.innerHTML = '<h3>Starting Lineup</h3>';
        }
        if (benchSection) {
            benchSection.innerHTML = '<h3>Bench</h3>';
        }

        const rosterPlayers = this.getRosterPlayers(roster);
        const leaguePos = this.leagueData && this.leagueData.roster_positions;
        const starters = roster && Array.isArray(roster.starters) ? roster.starters : [];

        if (leaguePos && starters.length > 0) {
            let startSlots = FantasyAPIController.getSleeperStartingSlotList(leaguePos);
            if (startSlots.length !== starters.length) {
                const alt = leaguePos.filter(p => !FantasyAPIController.isSleeperBenchPosition(p));
                if (alt.length === starters.length) startSlots = alt;
            }
            if (startSlots.length === starters.length && this.updateTeamDisplayFromSleeperSlots(roster, startSlots, rosterPlayers)) {
                this.finishLineupUpdate(rosterPlayers);
                return;
            }
        }

        const flexCount = this.getFlexSpots();
        const superFlexCount = this.getSuperFlexSpots();
        const positionGroups = {
            'QB': { count: 1, container: 'lineup-section' },
            'RB': { count: 2, container: 'lineup-section' },
            'WR': { count: 2, container: 'lineup-section' },
            'TE': { count: 1, container: 'lineup-section' },
            'FLEX': { count: flexCount, container: 'lineup-section' },
            ...(superFlexCount > 0 ? { SUPER_FLEX: { count: superFlexCount, container: 'lineup-section' } } : {}),
            'K': { count: 1, container: 'lineup-section' },
            'DEF': { count: 1, container: 'lineup-section' }
        };

        const playersByPosition = this.groupPlayersByPosition(rosterPlayers);
        Object.keys(positionGroups).forEach((position) => {
            this.createPositionGroup(
                position,
                positionGroups[position],
                playersByPosition[position] || []
            );
        });

        this.finishLineupUpdate(rosterPlayers);
    }

    /**
     * Maps Sleeper roster.starters to roster slot types so FLEX/SUPER_FLEX get the right players
     * (not just "all RBs" into the RB group).
     */
    updateTeamDisplayFromSleeperSlots(roster, startSlots, rosterPlayers) {
        const starters = roster.starters;
        if (!this.playersData || !Array.isArray(starters) || startSlots.length !== starters.length) return false;

        const toPlayer = (playerId) => {
            if (!playerId || playerId === '0' || !this.playersData[playerId]) return null;
            const player = this.playersData[playerId];
            const displayName = this.getPlayerDisplayName(player);
            return { ...player, full_name: player.full_name || displayName, player_id: playerId, isStarter: true };
        };

        const byKey = {};
        startSlots.forEach((raw, i) => {
            const key = FantasyAPIController.normalizeSleeperSlotKey(raw);
            if (!byKey[key]) byKey[key] = [];
            byKey[key].push(toPlayer(starters[i]));
        });

        const order = [];
        const orderRef = FantasyAPIController.SLEEPER_LINEUP_GROUP_ORDER;
        orderRef.forEach((k) => {
            if (byKey[k] && byKey[k].length) order.push(k);
        });
        Object.keys(byKey).forEach((k) => {
            if (!orderRef.includes(k) && byKey[k].length) order.push(k);
        });

        order.forEach((key) => {
            const players = byKey[key] || [];
            const displayName = FantasyAPIController.slotKeyToDisplayName(key);
            this.createPositionGroup(
                key,
                { count: players.length, container: 'lineup-section' },
                players,
                displayName
            );
        });

        return true;
    }

    finishLineupUpdate(rosterPlayers) {
        if (rosterPlayers) this.createBenchSection(rosterPlayers);
        if (typeof updateTeamOverallRating === 'function') {
            try {
                updateTeamOverallRating();
            } catch (e) {
                console.error('Failed to update team overall rating:', e);
            }
        }
    }

    getPlayerDisplayName(player) {
        if (!player) return 'Player';
        const name = player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ').trim();
        if (name) return name;
        const pos = (player.position || '').toUpperCase();
        if (pos === 'DEF' || pos === 'DST' || pos === 'D') {
            const team = player.team || player.player_id || '';
            const teamName = this.getTeamDisplayName(team);
            return teamName ? teamName + ' Defense' : (team ? team + ' Defense' : 'Team Defense');
        }
        return 'Player';
    }

    getTeamDisplayName(abbr) {
        const map = { ATL: 'Atlanta Falcons', BUF: 'Buffalo Bills', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers', TEN: 'Tennessee Titans', IND: 'Indianapolis Colts', KC: 'Kansas City Chiefs', LV: 'Las Vegas Raiders', LAR: 'Los Angeles Rams', LAC: 'Los Angeles Chargers', MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants', NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', ARI: 'Arizona Cardinals', PIT: 'Pittsburgh Steelers', SF: 'San Francisco 49ers', SEA: 'Seattle Seahawks', TB: 'Tampa Bay Buccaneers', WAS: 'Washington Commanders', CAR: 'Carolina Panthers', JAX: 'Jacksonville Jaguars', BAL: 'Baltimore Ravens', HOU: 'Houston Texans' };
        return map[(abbr || '').toUpperCase()] || '';
    }

    getRosterPlayers(roster) {
        const players = [];
        const toRosterPlayer = (player, playerId, isStarter) => {
            const displayName = this.getPlayerDisplayName(player);
            return { ...player, full_name: player.full_name || displayName, player_id: playerId, isStarter };
        };
        if (roster.starters) {
            roster.starters.forEach(playerId => {
                if (playerId && playerId !== '0') {
                    const player = this.playersData[playerId];
                    if (player) players.push(toRosterPlayer(player, playerId, true));
                }
            });
        }
        if (roster.players) {
            roster.players.forEach(playerId => {
                if (playerId && playerId !== '0' && !roster.starters?.includes(playerId)) {
                    const player = this.playersData[playerId];
                    if (player) players.push(toRosterPlayer(player, playerId, false));
                }
            });
        }
        return players;
    }

    groupPlayersByPosition(players) {
        const groups = {};
        
        players.forEach(player => {
            const position = player.position;
            if (!groups[position]) {
                groups[position] = [];
            }
            groups[position].push(player);
        });

        return groups;
    }

    createPositionGroup(position, config, players, displayName) {
        const container = document.querySelector(`.${config.container}`);
        if (!container) return;

        const positionGroup = document.createElement('div');
        positionGroup.className = 'position-group';
        const slotKey = String(position);
        positionGroup.setAttribute('data-lineup-slot', slotKey);
        
        const positionHeader = document.createElement('h4');
        positionHeader.textContent = displayName != null && displayName !== '' ? displayName : position;
        positionGroup.appendChild(positionHeader);
        const list = (players || []).slice(0, config.count);
        const addLabel = displayName != null && displayName !== slotKey ? displayName : null;
        for (let i = 0; i < list.length; i++) {
            const player = list[i];
            if (player) {
                const playerCard = this.createPlayerCard(player, slotKey, false);
                positionGroup.appendChild(playerCard);
            } else {
                positionGroup.appendChild(this.createPlayerPlaceholder(slotKey, addLabel));
            }
        }
        const emptySlots = config.count - list.length;
        for (let i = 0; i < emptySlots; i++) {
            positionGroup.appendChild(this.createPlayerPlaceholder(slotKey, addLabel));
        }

        container.appendChild(positionGroup);
    }

    getPlayerImageCandidates(player) {
        const playerId = player.player_id || player.playerId || player.player?.player_id || player.id;
        const candidates = [];
        // Team defense: use ESPN team logo (id like 'T33', team like 'BAL')
        const idStr = playerId != null ? String(playerId) : '';
        if (idStr.startsWith('T') && player.team) {
            candidates.push(`https://a.espncdn.com/i/teamlogos/nfl/500/${String(player.team).toLowerCase()}.png`);
        }
        // If an explicit image URL was provided (e.g., from ESPN), try it first
        if (player.image) {
            candidates.push(player.image);
        }
        if (playerId && !idStr.startsWith('T')) {
            // Common Sleeper headshot locations
            candidates.push(
                `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
                `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`,
                `https://static.sleepercdn.com/players/nfl/${playerId}.jpg`,
                `https://cdn.sleeper.app/img/nfl/players/${playerId}.jpg`
            );
        }
        // Always end with placeholder so image never breaks
        const labelSource =
            player.full_name ||
            (player.first_name && player.last_name && `${player.first_name} ${player.last_name}`) ||
            player.position ||
            '';
        const initials = String(labelSource)
            .split(' ')
            .filter(Boolean)
            .map(part => part[0])
            .join('')
            .slice(0, 3)
            .toUpperCase() || 'NFL';
        candidates.push(`https://via.placeholder.com/60x60/1a1a2e/ffffff?text=${encodeURIComponent(initials)}`);
        return candidates;
    }

    createPlayerImageElement(player) {
        const img = document.createElement('img');
        const sources = this.getPlayerImageCandidates(player);
        let idx = 0;
        const tryNext = () => {
            if (idx >= sources.length) return;
            img.src = sources[idx++];
        };
        img.alt = player.full_name || 'Player';
        img.onerror = () => {
            // Advance to next candidate
            tryNext();
        };
        tryNext();
        return img;
    }

    createPlayerCard(player, slotPosition = null, isBench = false) {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        if (isBench) playerCard.classList.add('bench');
        playerCard.setAttribute('data-slot-position', slotPosition || '');
        const pid = player.player_id || player.id;
        const displayName = this.getPlayerDisplayName(player);
        if (pid != null) playerCard.setAttribute('data-player-id', String(pid));
        playerCard.setAttribute('data-player-name', displayName);
        if (player.team != null) playerCard.setAttribute('data-player-team', String(player.team));
        
        const playerImage = document.createElement('div');
        playerImage.className = 'player-image';
        const imgEl = this.createPlayerImageElement(player);
        playerImage.appendChild(imgEl);
        
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        playerInfo.innerHTML = `
            <h5>${displayName}</h5>
            <p class="position">${player.position || ''} - ${player.team || ''}</p>
            <div class="rating">${this.calculatePlayerRating(player)}</div>
        `;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-inline';
        removeBtn.setAttribute('title', 'Remove');
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parent = playerCard.parentElement;
            const slotPos = playerCard.getAttribute('data-slot-position');
            playerCard.remove();
            if (!isBench && slotPos) {
                const placeholder = this.createPlayerPlaceholder(slotPos);
                parent.appendChild(placeholder);
            } else if (isBench && parent && parent.classList.contains('bench-players')) {
                parent.appendChild(this.createBenchPlaceholder());
            }
            // Recalculate team rating after removal
            if (typeof updateTeamOverallRating === 'function') {
                try {
                    updateTeamOverallRating();
                } catch (err) {
                    console.error('Failed to update team overall rating after removal:', err);
                }
            }
        });

        playerCard.appendChild(playerImage);
        playerCard.appendChild(playerInfo);
        playerCard.appendChild(removeBtn);

        const ratingEl = playerInfo.querySelector('.rating');
        if (ratingEl) ratingEl.setAttribute('data-loading', '1');
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(() => { this.fillRatingForCard(playerCard).catch(() => {}); });
        } else {
            setTimeout(() => { this.fillRatingForCard(playerCard).catch(() => {}); }, 0);
        }

        return playerCard;
    }

    getBenchSize() {
        if (this.leagueData && this.leagueData.settings && this.leagueData.settings.bench_spots != null) {
            const n = parseInt(this.leagueData.settings.bench_spots, 10);
            if (!isNaN(n) && n >= 0) return Math.min(10, n);
        }
        try {
            const saved = typeof localStorage !== 'undefined' && localStorage.getItem('leagueSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.benchSpots != null) {
                    const n = parseInt(parsed.benchSpots, 10);
                    if (!isNaN(n) && n >= 0) return Math.min(10, Math.max(0, n));
                }
            }
        } catch (e) {}
        return 6;
    }

    getFlexSpots() {
        if (this.leagueData && this.leagueData.settings && this.leagueData.settings.flex_spots != null) {
            const n = parseInt(this.leagueData.settings.flex_spots, 10);
            if (!isNaN(n) && n >= 0) return Math.min(8, Math.max(0, n));
        }
        try {
            const saved = typeof localStorage !== 'undefined' && localStorage.getItem('leagueSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.flexSpots != null) {
                    const n = parseInt(parsed.flexSpots, 10);
                    if (!isNaN(n) && n >= 0) return Math.min(8, Math.max(0, n));
                }
            }
        } catch (e) {}
        return 1;
    }

    getSuperFlexSpots() {
        if (this.leagueData && this.leagueData.settings && this.leagueData.settings.super_flex_spots != null) {
            const n = parseInt(this.leagueData.settings.super_flex_spots, 10);
            if (!isNaN(n) && n >= 0) return Math.min(4, Math.max(0, n));
        }
        return 0;
    }

    createPlayerPlaceholder(position, labelForTitle) {
        const slot = String(position);
        const title = labelForTitle != null && labelForTitle !== '' ? labelForTitle : slot;
        const placeholder = document.createElement('div');
        placeholder.className = 'player-card placeholder';
        
        placeholder.innerHTML = `
            <div class="player-image">
                <div class="placeholder-icon">+</div>
            </div>
            <div class="player-info">
                <h5>Add ${title}</h5>
                <p class="position">Click to add player</p>
                <div class="rating">--</div>
            </div>
        `;
        
        placeholder.addEventListener('click', () => {
            if (typeof showGlobalAddPlayerModal === 'function') {
                showGlobalAddPlayerModal({ mode: 'lineup', position: slot });
            }
        });
        
        return placeholder;
    }

    createBenchPlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.className = 'player-card placeholder bench';
        placeholder.setAttribute('data-slot-position', 'BENCH');
        placeholder.innerHTML = `
            <div class="player-image">
                <div class="placeholder-icon">+</div>
            </div>
            <div class="player-info">
                <h5>Add Bench</h5>
                <p class="position">Click to add player</p>
                <div class="rating">--</div>
            </div>
        `;
        placeholder.addEventListener('click', () => {
            if (typeof showGlobalAddPlayerModal === 'function') {
                showGlobalAddPlayerModal({ mode: 'lineup', position: 'BENCH' });
            }
        });
        return placeholder;
    }

    addPlayerToLineup(position, playerData) {
        const slotUpper = (position || '').toUpperCase();
        if (slotUpper === 'BENCH') {
            return this.addPlayerToBench(playerData);
        }
        // Enforce position rules: only allow players in their respective slot (FLEX accepts all)
        const playerPos = (playerData && playerData.position || '').trim();
        if (typeof isPlayerPositionAllowedForSlot === 'function' && !isPlayerPositionAllowedForSlot(playerPos, position)) {
            return false;
        }
        // Prevent duplicate: same player already in lineup or bench
        const newId = playerData && (playerData.id ?? playerData.player_id);
        const newKey = playerData && (playerData.full_name || '') + '|' + (playerData.team || '');
        const lineupCards = document.querySelectorAll('.lineup-section .player-card:not(.placeholder)');
        const benchCards = document.querySelectorAll('.bench-section .player-card');
        const allCards = [...lineupCards, ...benchCards];
        for (const card of allCards) {
            const existingId = card.getAttribute('data-player-id');
            const existingName = card.getAttribute('data-player-name');
            const existingTeam = card.getAttribute('data-player-team') || '';
            const existingKey = (existingName || '') + '|' + existingTeam;
            if (newId && existingId && String(newId) === String(existingId)) return 'duplicate';
            if (newKey && existingKey && newKey === existingKey) return 'duplicate';
        }
        // Find the first placeholder in the requested position group and replace it
        const wantSlot = String(position || '').toUpperCase();
        const groups = document.querySelectorAll('.lineup-section .position-group');
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            const dataSlot = (g.getAttribute('data-lineup-slot') || '').toUpperCase();
            if (dataSlot) {
                if (dataSlot !== wantSlot) continue;
            } else {
                const header = g.querySelector('h4');
                if (!header) continue;
                if (header.textContent.trim().toUpperCase() !== wantSlot) continue;
            }
            const placeholder = g.querySelector('.player-card.placeholder');
            if (placeholder) {
                const card = this.createPlayerCard({
                    full_name: playerData.full_name,
                    position: playerData.position,
                    team: playerData.team,
                    id: playerData.id,
                    player_id: playerData.player_id,
                    image: playerData.image
                }, position, false);
                g.replaceChild(card, placeholder);
                if (typeof updateTeamOverallRating === 'function') {
                    try {
                        updateTeamOverallRating();
                    } catch (e) {
                        console.error('Failed to update team overall rating after adding player:', e);
                    }
                }
                return true;
            }
        }
        return false;
    }

    addPlayerToBench(playerData) {
        const newId = playerData && (playerData.id ?? playerData.player_id);
        const newKey = playerData && (playerData.full_name || '') + '|' + (playerData.team || '');
        const lineupCards = document.querySelectorAll('.lineup-section .player-card:not(.placeholder)');
        const benchCards = document.querySelectorAll('.bench-section .player-card');
        const allCards = [...lineupCards, ...benchCards];
        for (const card of allCards) {
            const existingId = card.getAttribute('data-player-id');
            const existingName = card.getAttribute('data-player-name');
            const existingTeam = card.getAttribute('data-player-team') || '';
            const existingKey = (existingName || '') + '|' + existingTeam;
            if (newId && existingId && String(newId) === String(existingId)) return 'duplicate';
            if (newKey && existingKey && newKey === existingKey) return 'duplicate';
        }
        const benchPlaceholder = document.querySelector('.bench-section .player-card.placeholder');
        if (!benchPlaceholder) return false;
        const card = this.createPlayerCard({
            full_name: playerData.full_name,
            position: playerData.position,
            team: playerData.team,
            id: playerData.id,
            player_id: playerData.player_id,
            image: playerData.image
        }, null, true);
        benchPlaceholder.parentElement.replaceChild(card, benchPlaceholder);
        if (typeof updateTeamOverallRating === 'function') {
            try { updateTeamOverallRating(); } catch (e) { console.error(e); }
        }
        return true;
    }

    createBenchSection(rosterPlayers) {
        const benchSection = document.querySelector('.bench-section');
        if (!benchSection) return;
        const old = benchSection.querySelector('.bench-players');
        if (old) old.remove();
        const benchList = rosterPlayers.filter(player => !player.isStarter);
        const benchSize = this.getBenchSize();
        const benchContainer = document.createElement('div');
        benchContainer.className = 'bench-players';
        benchList.forEach(player => {
            benchContainer.appendChild(this.createPlayerCard(player, null, true));
        });
        const placeholderCount = Math.max(0, benchSize - benchList.length);
        for (let i = 0; i < placeholderCount; i++) {
            benchContainer.appendChild(this.createBenchPlaceholder());
        }
        benchSection.appendChild(benchContainer);
    }

    /**
     * Synchronous placeholder used while building player cards. Returns `--`;
     * the real rating is filled in by `fillRatingForCard`/`fillRatingsForCards`
     * once the server responds. We never invent a rating client-side.
     */
    calculatePlayerRating(_player) {
        return '--';
    }

    /**
     * Apply a server-side rating object to a single rating element.
     * The element should be a `.rating` or `.player-rating` chip.
     */
    static applyRatingToElement(el, rating) {
        if (!el) return;
        if (!rating || rating.rating == null) {
            el.textContent = '--';
            el.setAttribute('data-rating', '--');
            el.removeAttribute('data-loading');
            const drivers = (rating && Array.isArray(rating.drivers)) ? rating.drivers : ['No qualifying games'];
            el.setAttribute('data-drivers', JSON.stringify(drivers));
            el.setAttribute('data-confidence', '0');
            el.setAttribute('data-confidence-band', 'low');
            el.setAttribute('data-as-of', (rating && rating.asOf) || '');
            el.setAttribute('data-scoring', (rating && rating.scoring) || '');
            el.setAttribute('data-name', (rating && rating.name) || '');
            return;
        }
        const value = (typeof rating.rating === 'number') ? rating.rating.toFixed(1) : String(rating.rating);
        el.textContent = value;
        el.setAttribute('data-rating', value);
        el.removeAttribute('data-loading');
        el.setAttribute('data-drivers', JSON.stringify(rating.drivers || []));
        el.setAttribute('data-confidence', String(rating.confidence != null ? rating.confidence : 0));
        const band = (rating.confidence != null && rating.confidence < 0.6) ? 'low' : 'normal';
        el.setAttribute('data-confidence-band', band);
        el.setAttribute('data-as-of', rating.asOf || '');
        el.setAttribute('data-scoring', rating.scoring || '');
        el.setAttribute('data-name', rating.name || '');
        el.setAttribute('data-position', rating.position || '');
        el.setAttribute('data-games', String(rating.games || 0));
    }

    /**
     * Look at every `.player-card .rating` (and trade-list `.player-rating`)
     * currently in the DOM, group by player handle, fetch ratings in one
     * batch, then patch the chips. Safe to call repeatedly.
     */
    async fillRatingsForCards(scoring) {
        if (typeof document === 'undefined') return;
        const cardChips = Array.from(document.querySelectorAll('.player-card .rating'));
        const tradeChips = Array.from(document.querySelectorAll('.trade-player-item .player-rating'));
        const all = [...cardChips, ...tradeChips];
        const handles = [];
        const targets = [];
        const seen = new Set();
        for (const el of all) {
            if (el.getAttribute('data-rating') && el.getAttribute('data-rating') !== '--' && !el.getAttribute('data-loading')) continue;
            const card = el.closest('[data-player-id], [data-player-name]');
            if (!card) continue;
            const id = card.getAttribute('data-player-id') || '';
            const name = card.getAttribute('data-player-name') || '';
            const team = card.getAttribute('data-player-team') || '';
            const key = id ? `id:${id}` : `name:${name}|${team}`;
            const handle = id ? { id, name, team } : { name, team };
            el.setAttribute('data-loading', '1');
            if (!seen.has(key)) {
                seen.add(key);
                handles.push(handle);
            }
            targets.push({ el, handle, key });
        }
        if (handles.length === 0) return;

        const ratings = await this.getPlayerRatings(handles, scoring);
        for (const t of targets) {
            const r = ratings.get(this._playerKey(t.handle));
            FantasyAPIController.applyRatingToElement(t.el, r);
        }
    }

    /**
     * Convenience: fill the rating chip(s) for a single card immediately
     * after it's been appended to the DOM. Called from createPlayerCard.
     */
    async fillRatingForCard(card, scoring) {
        if (!card) return;
        const el = card.querySelector('.rating') || card.querySelector('.player-rating');
        if (!el) return;
        if (el.getAttribute('data-rating') && el.getAttribute('data-rating') !== '--' && !el.getAttribute('data-loading')) return;
        el.setAttribute('data-loading', '1');
        const id = card.getAttribute('data-player-id') || '';
        const name = card.getAttribute('data-player-name') || '';
        const team = card.getAttribute('data-player-team') || '';
        const handle = id ? { id, name, team } : { name, team };
        const rating = await this.getPlayerRating(handle, scoring);
        FantasyAPIController.applyRatingToElement(el, rating);
    }

    showEmptyTeamDisplay() {
        // Show empty team with placeholder buttons
        const lineupSection = document.querySelector('.lineup-section');
        const benchSection = document.querySelector('.bench-section');
        
        if (lineupSection) {
            lineupSection.innerHTML = '<h3>Starting Lineup</h3>';
            this.createEmptyPositionGroups(lineupSection);
        }
        
        if (benchSection) {
            const benchSize = this.getBenchSize();
            benchSection.innerHTML = '<h3>Bench</h3>';
            const benchContainer = document.createElement('div');
            benchContainer.className = 'bench-players';
            for (let i = 0; i < benchSize; i++) {
                benchContainer.appendChild(this.createBenchPlaceholder());
            }
            benchSection.appendChild(benchContainer);
        }

        if (typeof updateTeamOverallRating === 'function') {
            try { updateTeamOverallRating(); } catch (e) { console.error('Failed to reset team overall rating:', e); }
        }
    }

    refreshBenchSlots() {
        const benchSection = document.querySelector('.bench-section');
        if (!benchSection) return;
        let benchPlayers = benchSection.querySelector('.bench-players');
        const wantTotal = this.getBenchSize();
        const currentCards = benchPlayers ? Array.from(benchPlayers.querySelectorAll('.player-card')) : [];
        const filled = currentCards.filter(c => !c.classList.contains('placeholder'));
        const placeholders = currentCards.filter(c => c.classList.contains('placeholder'));
        const currentTotal = currentCards.length;
        if (currentTotal === wantTotal) return;
        if (!benchPlayers) {
            benchSection.innerHTML = '<h3>Bench</h3>';
            benchPlayers = document.createElement('div');
            benchPlayers.className = 'bench-players';
            benchSection.appendChild(benchPlayers);
            filled.forEach(card => benchPlayers.appendChild(card));
            for (let i = 0; i < wantTotal - filled.length; i++) benchPlayers.appendChild(this.createBenchPlaceholder());
            return;
        }
        if (currentTotal > wantTotal) {
            let toRemove = currentTotal - wantTotal;
            placeholders.forEach(p => {
                if (toRemove > 0 && p.parentNode) { p.parentNode.removeChild(p); toRemove--; }
            });
            return;
        }
        for (let i = 0; i < wantTotal - currentTotal; i++) {
            benchPlayers.appendChild(this.createBenchPlaceholder());
        }
    }

    createEmptyPositionGroups(container) {
        const flexCount = this.getFlexSpots();
        const superFlexCount = this.getSuperFlexSpots();
        const positions = [
            { name: 'QB', count: 1, label: 'QB' },
            { name: 'RB', count: 2, label: 'RB' },
            { name: 'WR', count: 2, label: 'WR' },
            { name: 'TE', count: 1, label: 'TE' },
            { name: 'FLEX', count: flexCount, label: 'FLEX' },
            ...(superFlexCount > 0 ? [{ name: 'SUPER_FLEX', count: superFlexCount, label: 'Superflex' }] : []),
            { name: 'K', count: 1, label: 'K' },
            { name: 'DEF', count: 1, label: 'DEF' }
        ];

        positions.forEach(pos => {
            const positionGroup = document.createElement('div');
            positionGroup.className = 'position-group';
            positionGroup.setAttribute('data-lineup-slot', pos.name);
            
            const positionHeader = document.createElement('h4');
            positionHeader.textContent = pos.label;
            positionGroup.appendChild(positionHeader);

            for (let i = 0; i < pos.count; i++) {
                const placeholder = this.createPlayerPlaceholder(
                    pos.name,
                    pos.name === 'SUPER_FLEX' ? 'Superflex' : null
                );
                positionGroup.appendChild(placeholder);
            }

            container.appendChild(positionGroup);
        });
    }

    showAddPlayerModal(position) {
        // Placeholder for add player modal
        showNotification(`Add ${position} player functionality coming soon!`, 'info');
    }

    /**
     * AI runs only on the server; OPENAI_API_KEY or OPEN_API_KEY in .env (never the browser).
     * window.APP_API_URL can override the API origin when the static site is on another host.
     */
    static async _postAnalyzeJson(path, body) {
        if (typeof fetch === 'undefined') throw new Error('Network not available');
        const base = (typeof window !== 'undefined' && window.APP_API_URL)
            ? String(window.APP_API_URL).replace(/\/$/, '') + '/'
            : '/';
        const response = await fetch(base + path.replace(/^\//, ''), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const text = await response.text();
        let data = {};
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (e) {
                if (!response.ok) {
                    throw new Error(text || `Request failed (${response.status})`);
                }
            }
        }
        if (!response.ok) {
            const err = (data && (data.error || data.message)) || text || `Request failed (${response.status})`;
            throw new Error(err);
        }
        return data;
    }

    async analyzeTradeWithOpenAI(givingPlayers, receivingPlayers) {
        const data = await FantasyAPIController._postAnalyzeJson('api/analyze-trade', {
            givingPlayers,
            receivingPlayers,
            model: this.openAIModel
        });
        return {
            fairness: data.fairness || 'Fair',
            grade: typeof data.grade === 'number' ? data.grade : 50,
            summary: data.summary || '',
            contextAsOf: data.contextAsOf || null,
            sources: Array.isArray(data.sources) ? data.sources : [],
            disclaimer: data.disclaimer || ''
        };
    }

    async analyzeTeamWithOpenAI(lineupPlayers, benchPlayers) {
        const data = await FantasyAPIController._postAnalyzeJson('api/analyze-team', {
            lineupPlayers,
            benchPlayers,
            model: this.openAIModel
        });
        return {
            strengths: data.strengths ?? [],
            weaknesses: data.weaknesses ?? data.needsHelp ?? [],
            needsHelp: data.needsHelp ?? data.weaknesses ?? [],
            tradeTargets: data.tradeTargets ?? [],
            tradeAway: data.tradeAway ?? [],
            dropCandidates: data.dropCandidates ?? [],
            overallSummary: data.overallSummary || '',
            nextActions: data.nextActions ?? [],
            contextAsOf: data.contextAsOf || null,
            sources: Array.isArray(data.sources) ? data.sources : [],
            disclaimer: data.disclaimer || ''
        };
    }

    // Future methods for other providers
    async connectESPNAccount() {
        // ESPN integration would go here
        throw new Error('ESPN integration not yet implemented');
    }

    async connectYahooAccount() {
        // Yahoo integration would go here
        throw new Error('Yahoo integration not yet implemented');
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FantasyAPIController;
}
