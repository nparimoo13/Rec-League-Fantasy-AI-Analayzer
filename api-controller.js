// API Controller Class for Fantasy Football Data
// Handles all external API integrations (Sleeper, ESPN, Yahoo, etc.)

class FantasyAPIController {
    constructor() {
        this.baseURL = 'https://api.sleeper.app/v1';
        this.userData = null;
        this.leagueData = null;
    }

    // Sleeper API Methods
    async getUserByUsername(username) {
        try {
            const response = await fetch(`${this.baseURL}/user/${username}`);
            if (!response.ok) {
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

    // Main integration method
    async connectSleeperAccount(username) {
        try {
            showNotification('Connecting to Sleeper...', 'info');
            
            // Get user data
            this.userData = await this.getUserByUsername(username);
            console.log('User data:', this.userData);
            
            // Get user's leagues for current season
            const leagues = await this.getUserLeagues(this.userData.user_id);
            console.log('User leagues:', leagues);
            
            if (leagues.length === 0) {
                throw new Error('No leagues found for this user');
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

        // Define position groups and their requirements
        const positionGroups = {
            'QB': { count: 1, container: 'lineup-section' },
            'RB': { count: 2, container: 'lineup-section' },
            'WR': { count: 2, container: 'lineup-section' },
            'TE': { count: 1, container: 'lineup-section' },
            'FLEX': { count: 1, container: 'lineup-section' },
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
    }

    getRosterPlayers(roster) {
        const players = [];
        
        // Process starting lineup
        if (roster.starters) {
            roster.starters.forEach(playerId => {
                if (playerId && playerId !== '0') {
                    const player = this.playersData[playerId];
                    if (player) {
                        players.push({
                            ...player,
                            player_id: playerId,
                            isStarter: true
                        });
                    }
                }
            });
        }

        // Process bench players
        if (roster.players) {
            roster.players.forEach(playerId => {
                if (playerId && playerId !== '0' && !roster.starters?.includes(playerId)) {
                    const player = this.playersData[playerId];
                    if (player) {
                        players.push({
                            ...player,
                            player_id: playerId,
                            isStarter: false
                        });
                    }
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
        // If an explicit image URL was provided (e.g., from ESPN), try it first
        if (player.image) {
            candidates.push(player.image);
        }
        if (playerId) {
            // Common Sleeper headshot locations
            candidates.push(
                `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
                `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`,
                `https://static.sleepercdn.com/players/nfl/${playerId}.jpg`,
                `https://cdn.sleeper.app/img/nfl/players/${playerId}.jpg`
            );
        }
        // Always end with placeholder so image never breaks
        candidates.push(`https://via.placeholder.com/60x60/1a1a2e/ffffff?text=${player.position || ''}`);
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
        
        const playerImage = document.createElement('div');
        playerImage.className = 'player-image';
        const imgEl = this.createPlayerImageElement(player);
        playerImage.appendChild(imgEl);
        
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        playerInfo.innerHTML = `
            <h5>${player.full_name}</h5>
            <p class="position">${player.position} - ${player.team}</p>
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
            // If lineup slot (not bench) then restore placeholder
            if (!isBench && slotPos) {
                const placeholder = this.createPlayerPlaceholder(slotPos);
                parent.appendChild(placeholder);
            }
        });

        playerCard.appendChild(playerImage);
        playerCard.appendChild(playerInfo);
        playerCard.appendChild(removeBtn);
        
        return playerCard;
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

    addPlayerToLineup(position, playerData) {
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
                return true;
            }
        }
        return false;
    }

    createBenchSection(rosterPlayers) {
        const benchSection = document.querySelector('.bench-section');
        if (!benchSection) return;

        const benchPlayers = rosterPlayers.filter(player => !player.isStarter);
        
        if (benchPlayers.length > 0) {
            const benchContainer = document.createElement('div');
            benchContainer.className = 'bench-players';
            
            benchPlayers.forEach(player => {
                const playerCard = this.createPlayerCard(player, null, true);
                benchContainer.appendChild(playerCard);
            });
            
            benchSection.appendChild(benchContainer);
        } else {
            const emptyBench = document.createElement('div');
            emptyBench.className = 'empty-bench';
            emptyBench.innerHTML = '<p>No bench players</p>';
            benchSection.appendChild(emptyBench);
        }
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
            benchSection.innerHTML = '<h3>Bench</h3><div class="bench-players"><p>No players added yet</p></div>';
        }
    }

    createEmptyPositionGroups(container) {
        const positions = [
            { name: 'QB', count: 1 },
            { name: 'RB', count: 2 },
            { name: 'WR', count: 2 },
            { name: 'TE', count: 1 },
            { name: 'FLEX', count: 1 },
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
    async analyzeTrade(givingPlayers, receivingPlayers) {
        // This would integrate with your existing trade analysis
        // but could also pull in Sleeper-specific data
        return {
            netValue: 0,
            recommendation: 'Trade analysis using Sleeper data'
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
