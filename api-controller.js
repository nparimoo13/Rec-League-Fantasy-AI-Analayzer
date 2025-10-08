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
            
            // For now, use the first league (could be enhanced to let user choose)
            const selectedLeague = leagues[0];
            this.leagueData = selectedLeague;
            
            // Get league rosters and users
            const [rosters, users] = await Promise.all([
                this.getLeagueRosters(selectedLeague.league_id),
                this.getLeagueUsers(selectedLeague.league_id)
            ]);
            
            // Store the data
            this.leagueData.rosters = rosters;
            this.leagueData.users = users;
            
            showNotification(`Successfully connected to ${selectedLeague.name}!`, 'success');
            
            // Update UI with league data
            this.updateUIWithLeagueData();
            
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
        // Update league settings display
        const leagueName = this.leagueData.name;
        const leagueType = this.leagueData.settings.dynasty ? 'Dynasty' : 'Redraft';
        const scoringType = this.leagueData.settings.scoring_settings.rec;
        
        // Update the manual settings with league data
        document.getElementById('leagueType').value = leagueType.toLowerCase();
        document.getElementById('scoringFormat').value = scoringType > 0 ? 'full-ppr' : 'no-ppr';
        
        // Show success message with league info
        showNotification(`Connected to ${leagueName} (${leagueType})`, 'success');
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
