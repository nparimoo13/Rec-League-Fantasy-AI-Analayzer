// API Controller Class for Fantasy Football Data
// Handles all external API integrations (Sleeper, ESPN, Yahoo, etc.)

class FantasyAPIController {
    constructor() {
        this.baseURL = 'https://api.sleeper.app/v1';
        this.userData = null;
        this.leagueData = null;
        this.openAIModel = 'gpt-4o-mini';
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

    async selectLeague(selectedLeague) {
        try {
            showNotification(`Loading ${selectedLeague.name}...`, 'info');
            this.leagueData = selectedLeague;
            if (selectedLeague.roster_positions && Array.isArray(selectedLeague.roster_positions)) {
                this.leagueData.settings = this.leagueData.settings || {};
                const benchCount = selectedLeague.roster_positions.filter(p => String(p).toUpperCase() === 'BN').length;
                if (benchCount > 0) this.leagueData.settings.bench_spots = benchCount;
                const flexCount = selectedLeague.roster_positions.filter(p => String(p).toUpperCase() === 'FLEX').length;
                if (flexCount > 0) this.leagueData.settings.flex_spots = Math.min(4, flexCount);
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
        // Clear existing team content
        const lineupSection = document.querySelector('.lineup-section');
        const benchSection = document.querySelector('.bench-section');
        
        if (lineupSection) {
            lineupSection.innerHTML = '<h3>Starting Lineup</h3>';
        }
        
        if (benchSection) {
            benchSection.innerHTML = '<h3>Bench</h3>';
        }

        // Define position groups and their requirements (flex count from settings)
        const flexCount = this.getFlexSpots();
        const positionGroups = {
            'QB': { count: 1, container: 'lineup-section' },
            'RB': { count: 2, container: 'lineup-section' },
            'WR': { count: 2, container: 'lineup-section' },
            'TE': { count: 1, container: 'lineup-section' },
            'FLEX': { count: flexCount, container: 'lineup-section' },
            'K': { count: 1, container: 'lineup-section' },
            'DEF': { count: 1, container: 'lineup-section' }
        };

        // Process roster players
        const rosterPlayers = this.getRosterPlayers(roster);
        
        // Group players by position
        const playersByPosition = this.groupPlayersByPosition(rosterPlayers);
        
        // Create position groups
        Object.entries(positionGroups).forEach(([position, config]) => {
            this.createPositionGroup(position, config, playersByPosition[position] || []);
        });

        // Add bench players
        this.createBenchSection(rosterPlayers);

        // Update overall team rating based on current lineup
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

    createPositionGroup(position, config, players) {
        const container = document.querySelector(`.${config.container}`);
        if (!container) return;

        const positionGroup = document.createElement('div');
        positionGroup.className = 'position-group';
        
        const positionHeader = document.createElement('h4');
        positionHeader.textContent = position;
        positionGroup.appendChild(positionHeader);

        // Add existing players
        players.slice(0, config.count).forEach(player => {
            const playerCard = this.createPlayerCard(player, position, false);
            positionGroup.appendChild(playerCard);
        });

        // Add placeholder buttons for empty slots
        const emptySlots = config.count - players.length;
        for (let i = 0; i < emptySlots; i++) {
            const placeholder = this.createPlayerPlaceholder(position);
            positionGroup.appendChild(placeholder);
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
            if (!isNaN(n) && n >= 0) return Math.min(4, Math.max(0, n));
        }
        try {
            const saved = typeof localStorage !== 'undefined' && localStorage.getItem('leagueSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.flexSpots != null) {
                    const n = parseInt(parsed.flexSpots, 10);
                    if (!isNaN(n) && n >= 0) return Math.min(4, Math.max(0, n));
                }
            }
        } catch (e) {}
        return 1;
    }

    createPlayerPlaceholder(position) {
        const placeholder = document.createElement('div');
        placeholder.className = 'player-card placeholder';
        
        placeholder.innerHTML = `
            <div class="player-image">
                <div class="placeholder-icon">+</div>
            </div>
            <div class="player-info">
                <h5>Add ${position}</h5>
                <p class="position">Click to add player</p>
                <div class="rating">--</div>
            </div>
        `;
        
        // Add click handler for adding players via global modal tied to lineup
        placeholder.addEventListener('click', () => {
            if (typeof showGlobalAddPlayerModal === 'function') {
                showGlobalAddPlayerModal({ mode: 'lineup', position });
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
        const groups = document.querySelectorAll('.lineup-section .position-group');
        for (let i = 0; i < groups.length; i++) {
            const header = groups[i].querySelector('h4');
            if (!header) continue;
            if (header.textContent.trim().toUpperCase() !== String(position).toUpperCase()) continue;
            const placeholder = groups[i].querySelector('.player-card.placeholder');
            if (placeholder) {
                const card = this.createPlayerCard({
                    full_name: playerData.full_name,
                    position: playerData.position,
                    team: playerData.team,
                    id: playerData.id,
                    player_id: playerData.player_id,
                    image: playerData.image
                }, position, false);
                groups[i].replaceChild(card, placeholder);
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

    calculatePlayerRating(player) {
        // Simple rating calculation - could be enhanced with actual Sleeper data
        return Math.floor(Math.random() * 20) + 80; // Placeholder rating
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
        const positions = [
            { name: 'QB', count: 1 },
            { name: 'RB', count: 2 },
            { name: 'WR', count: 2 },
            { name: 'TE', count: 1 },
            { name: 'FLEX', count: flexCount },
            { name: 'K', count: 1 },
            { name: 'DEF', count: 1 }
        ];

        positions.forEach(pos => {
            const positionGroup = document.createElement('div');
            positionGroup.className = 'position-group';
            
            const positionHeader = document.createElement('h4');
            positionHeader.textContent = pos.name;
            positionGroup.appendChild(positionHeader);

            for (let i = 0; i < pos.count; i++) {
                const placeholder = this.createPlayerPlaceholder(pos.name);
                positionGroup.appendChild(placeholder);
            }

            container.appendChild(positionGroup);
        });
    }

    showAddPlayerModal(position) {
        // Placeholder for add player modal
        showNotification(`Add ${position} player functionality coming soon!`, 'info');
    }

    // Trade analysis methods
    getOpenAIBaseUrl() {
        if (typeof window === 'undefined') return '';
        return (window.APP_API_URL || '').replace(/\/$/, '');
    }

    getOpenAIApiKey() {
        try {
            let key = (typeof window !== 'undefined' && window.OPENAI_API_KEY) || localStorage.getItem('openai_api_key') || '';
            if (!key && typeof window !== 'undefined') {
                const entered = window.prompt(
                    'Enter your OpenAI API key to enable AI-powered trade analysis. This key will be stored locally in your browser.'
                );
                if (entered && entered.trim()) {
                    key = entered.trim();
                    localStorage.setItem('openai_api_key', key);
                }
            }
            return key;
        } catch (e) {
            console.error('Error retrieving OpenAI API key:', e);
            return '';
        }
    }

    async analyzeTradeWithOpenAI(givingPlayers, receivingPlayers) {
        const baseUrl = this.getOpenAIBaseUrl();
        try {
            const response = await fetch((baseUrl ? baseUrl + '/' : '') + 'api/analyze-trade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        givingPlayers,
                        receivingPlayers,
                        model: this.openAIModel
                    })
                });
            if (response.ok) {
                const data = await response.json();
                return {
                    fairness: data.fairness || 'Fair',
                    grade: typeof data.grade === 'number' ? data.grade : 50,
                    summary: data.summary || ''
                };
            }
        } catch (e) {
            console.warn('Backend AI unavailable, falling back to client key:', e.message);
        }
        const apiKey = this.getOpenAIApiKey();
        if (!apiKey) {
            throw new Error('OpenAI API key is required for AI trade analysis. Use the server (see README) or enter your key when prompted.');
        }

        const payload = {
            model: this.openAIModel,
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
                        JSON.stringify(givingPlayers, null, 2) +
                        '\n\nRECEIVING:\n' +
                        JSON.stringify(receivingPlayers, null, 2) +
                        '\n\n' +
                        'Return ONLY a JSON object (no extra text) with this shape:\n' +
                        '{\n' +
                        '  "fairness": "Favorable" | "Fair" | "Unfavorable",\n' +
                        '  "grade": number, // 0-100 overall grade for MY side\n' +
                        '  "summary": string // 2-4 short sentences of advice\n' +
                        '}'
                }
            ]
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            console.error('OpenAI API error response:', text);
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const content =
            (data &&
                data.choices &&
                data.choices[0] &&
                data.choices[0].message &&
                data.choices[0].message.content) ||
            '';

        if (!content) {
            throw new Error('OpenAI returned an empty response for trade analysis.');
        }

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            console.warn('Failed to parse OpenAI JSON, using raw content as summary.', e);
            parsed = {
                fairness: 'Fair',
                grade: 50,
                summary: content
            };
        }

        return {
            fairness: parsed.fairness || 'Fair',
            grade: typeof parsed.grade === 'number' ? parsed.grade : 50,
            summary: parsed.summary || ''
        };
    }

    async analyzeTeamWithOpenAI(lineupPlayers, benchPlayers) {
        const baseUrl = this.getOpenAIBaseUrl();
        try {
            const response = await fetch((baseUrl ? baseUrl + '/' : '') + 'api/analyze-team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lineupPlayers,
                    benchPlayers,
                    model: this.openAIModel
                })
            });
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.warn('Backend AI unavailable, falling back to client key:', e.message);
        }
        const apiKey = this.getOpenAIApiKey();
        if (!apiKey) {
            throw new Error('OpenAI API key is required for AI team analysis. Use the server (see README) or enter your key when prompted.');
        }

        const payload = {
            model: this.openAIModel,
            temperature: 0.4,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are an expert fantasy football analyst. Given a starting lineup and bench, ' +
                        'you provide actionable advice: strengths, weaknesses, trade targets, players to trade away, and drop candidates. ' +
                        'Be specific with player names and positions. Respond with valid JSON only.'
                },
                {
                    role: 'user',
                    content:
                        'Analyze this fantasy football roster.\n\n' +
                        'STARTING LINEUP (with slot and rating):\n' +
                        JSON.stringify(lineupPlayers, null, 2) +
                        '\n\nBENCH:\n' +
                        JSON.stringify(benchPlayers, null, 2) +
                        '\n\nReturn ONLY a JSON object (no markdown, no extra text) with this exact shape:\n' +
                        '{\n' +
                        '  "strengths": "2-4 sentences on where this team is strong (positions, depth, etc.)",\n' +
                        '  "needsHelp": "2-4 sentences on where the team is weak or could improve",\n' +
                        '  "tradeTargets": "2-4 specific player types or positions to target (e.g. upgrade at RB2, add WR depth)",\n' +
                        '  "tradeAway": "2-4 sentences on which players to consider trading away to improve the team",\n' +
                        '  "dropCandidates": "2-4 sentences on bench players who could be dropped for waivers or upgrades"\n' +
                        '}'
                }
            ]
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            console.error('OpenAI API error response:', text);
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const content =
            (data &&
                data.choices &&
                data.choices[0] &&
                data.choices[0].message &&
                data.choices[0].message.content) ||
            '';

        if (!content) {
            throw new Error('OpenAI returned an empty response for team analysis.');
        }

        const trimmed = content.replace(/^```json?\s*|\s*```$/g, '').trim();
        let parsed;
        try {
            parsed = JSON.parse(trimmed);
        } catch (e) {
            console.warn('Failed to parse OpenAI team analysis JSON, using raw as summary.', e);
            parsed = {
                strengths: '',
                needsHelp: content,
                tradeTargets: '',
                tradeAway: '',
                dropCandidates: ''
            };
        }

        return {
            strengths: parsed.strengths || '',
            needsHelp: parsed.needsHelp || '',
            tradeTargets: parsed.tradeTargets || '',
            tradeAway: parsed.tradeAway || '',
            dropCandidates: parsed.dropCandidates || ''
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
