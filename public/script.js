// Fantasy Football Team & Trade Analyzer JavaScript
// Main application logic and UI interactions

// Initialize API Controller (loaded from external file)
const apiController = new FantasyAPIController();
if (typeof window !== 'undefined') window.apiController = apiController;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application
    initializeApp();
});

function initializeApp() {
    setupLeagueSettings();
    setupTradeAnalyzer();
    setupAnalyzeTeam();
    setupFooterContact();
    setupPlayerInteractions();
    initializeTeamDisplay();
}

function initializeTeamDisplay() {
    // Show empty team display initially
    if (apiController) {
        apiController.showEmptyTeamDisplay();
    }
}

// League Settings Functionality
function setupLeagueSettings() {
    const manualToggle = document.getElementById('manualMode');
    const manualSettings = document.getElementById('manualSettings');
    const benchSpotsInput = document.getElementById('benchSpots');
    const flexSpotsInput = document.getElementById('flexSpots');
    try {
        const saved = JSON.parse(localStorage.getItem('leagueSettings') || '{}');
        if (saved.benchSpots != null && benchSpotsInput) {
            const n = Math.min(10, Math.max(0, parseInt(saved.benchSpots, 10)));
            if (!isNaN(n)) benchSpotsInput.value = n;
        }
        if (saved.flexSpots != null && flexSpotsInput) {
            const n = Math.min(8, Math.max(0, parseInt(saved.flexSpots, 10)));
            if (!isNaN(n)) flexSpotsInput.value = n;
        }
    } catch (e) {}
    // Toggle manual settings visibility
    manualToggle.addEventListener('change', function() {
        if (this.checked) {
            manualSettings.style.display = 'block';
            manualSettings.style.animation = 'fadeIn 0.3s ease-in';
        } else {
            manualSettings.style.display = 'none';
        }
    });
    
    // Provider button interactions
    const providerButtons = document.querySelectorAll('.provider-btn');
    providerButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            providerButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            
            if (this.classList.contains('sleeper')) {
                showSleeperUsernamePopup();
            } else if (this.classList.contains('espn')) {
                showESPNImportPopup();
            } else if (this.classList.contains('yahoo')) {
                showYahooImportPopup();
            } else {
                showProviderConnection(this.textContent.trim());
            }
        });
    });
    
    // League settings change handlers
    const scoringFormat = document.getElementById('scoringFormat');
    const leagueType = document.getElementById('leagueType');
    const superflex = document.getElementById('superflex');
    const benchSpots = document.getElementById('benchSpots');
    const flexSpots = document.getElementById('flexSpots');
    [scoringFormat, leagueType, superflex, benchSpots, flexSpots].forEach(element => {
        if (element) element.addEventListener('change', updateLeagueSettings);
    });
    if (benchSpots) benchSpots.addEventListener('input', updateLeagueSettings);
    if (flexSpots) flexSpots.addEventListener('input', updateLeagueSettings);
}

function showSleeperUsernamePopup() {
    // Create a modal for Sleeper username input
    const modal = document.createElement('div');
    modal.className = 'sleeper-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-bed"></i> Connect to Sleeper</h3>
                <p>Enter your Sleeper username to import your league data</p>
            </div>
            <div class="modal-body">
                <div class="input-group">
                    <label for="sleeperUsername">Sleeper Username</label>
                    <input type="text" id="sleeperUsername" placeholder="Enter your Sleeper username" autocomplete="username">
                    <div class="input-help">
                        <i class="fas fa-info-circle"></i>
                        <span>This is the username you use to log into Sleeper</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel">Cancel</button>
                <button class="btn-connect" id="connectSleeper">
                    <i class="fas fa-link"></i>
                    Connect
                </button>
            </div>
        </div>
    `;
    
    // Add modal styles
    const style = document.createElement('style');
    style.textContent = `
        .sleeper-modal {
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
        .sleeper-modal .modal-content {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            padding: 0;
            border-radius: 20px;
            border: 2px solid #00d4aa;
            max-width: 450px;
            width: 90%;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            overflow: hidden;
        }
        .modal-header {
            padding: 30px 30px 20px;
            text-align: center;
            border-bottom: 1px solid rgba(0, 212, 170, 0.2);
        }
        .modal-header h3 {
            color: #00d4aa;
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
            line-height: 1.5;
        }
        .modal-body {
            padding: 30px;
        }
        .input-group {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .input-group label {
            color: #00d4aa;
            font-weight: 600;
            font-size: 1rem;
        }
        .input-group input {
            background: #0f0f1a;
            border: 2px solid #00d4aa;
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            font-size: 1rem;
            transition: all 0.3s ease;
        }
        .input-group input:focus {
            outline: none;
            border-color: #4a9eff;
            box-shadow: 0 0 15px rgba(0, 212, 170, 0.3);
        }
        .input-help {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #b0b0b0;
            font-size: 0.9rem;
        }
        .input-help i {
            color: #4a9eff;
        }
        .modal-footer {
            padding: 20px 30px 30px;
            display: flex;
            gap: 15px;
            justify-content: flex-end;
        }
        .btn-cancel, .btn-connect {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .btn-cancel {
            background: #2a2a4a;
            color: #b0b0b0;
            border: 1px solid #4a4a6a;
        }
        .btn-cancel:hover {
            background: #3a3a5a;
            color: white;
        }
        .btn-connect {
            background: linear-gradient(135deg, #00d4aa 0%, #4a9eff 100%);
            color: #1a1a2e;
        }
        .btn-connect:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 212, 170, 0.3);
        }
        .btn-connect:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
    
    // Focus on input
    const usernameInput = modal.querySelector('#sleeperUsername');
    usernameInput.focus();
    
    // Connect button functionality
    const connectBtn = modal.querySelector('#connectSleeper');
    const cancelBtn = modal.querySelector('.btn-cancel');
    
    connectBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        
        if (!username) {
            showNotification('Please enter your Sleeper username', 'warning');
            return;
        }
        
        // Disable button and show loading
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        
        try {
            await apiController.connectSleeperAccount(username);
            // Close modal on success
            document.body.removeChild(modal);
            document.head.removeChild(style);
        } catch (error) {
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<i class="fas fa-link"></i> Connect';
            const msg = error && error.message ? error.message : 'Connection failed';
            const isNetwork = /failed to fetch|network|load/i.test(msg);
            showNotification(isNetwork ? 'Could not reach Sleeper. Check your connection or try again.' : msg, 'warning');
        }
    });
    
    // Cancel button functionality
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
    
    // Enter key to connect
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            connectBtn.click();
        }
    });
}

function showESPNImportPopup() {
    const modal = document.createElement('div');
    modal.className = 'sleeper-modal espn-import-modal';
    const currentYear = new Date().getFullYear();
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-tv"></i> Import from ESPN</h3>
                <p>Enter your League ID and season to load your league and pick your team</p>
            </div>
            <div class="modal-body">
                <div class="input-group">
                    <label for="espnLeagueId">League ID</label>
                    <input type="text" id="espnLeagueId" placeholder="e.g. 123456" inputmode="numeric">
                    <div class="input-help">
                        <i class="fas fa-info-circle"></i>
                        <span>Find this in your league URL: fantasy.espn.com/football/...leagueId=<strong>123456</strong></span>
                    </div>
                </div>
                <div class="input-group">
                    <label for="espnSeason">Season</label>
                    <input type="text" id="espnSeason" placeholder="${currentYear}" value="${currentYear}" inputmode="numeric">
                </div>
                <div class="input-group">
                    <label for="espnTeamId">Your Team ID (optional)</label>
                    <input type="text" id="espnTeamId" placeholder="Leave blank to pick from list">
                    <div class="input-help">
                        <i class="fas fa-info-circle"></i>
                        <span>In the URL: teamId=<strong>7</strong>. If blank, you'll choose your team after loading.</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel">Cancel</button>
                <button class="btn-connect" id="connectESPN">
                    <i class="fas fa-link"></i> Import League
                </button>
            </div>
        </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
        .espn-import-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(5px); }
        .espn-import-modal .modal-content { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 0; border-radius: 20px; border: 2px solid #e31937; max-width: 450px; width: 90%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); overflow: hidden; }
        .espn-import-modal .modal-header { padding: 30px 30px 20px; text-align: center; border-bottom: 1px solid rgba(227,25,55,0.2); }
        .espn-import-modal .modal-header h3 { color: #e31937; margin-bottom: 10px; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; gap: 10px; }
        .espn-import-modal .modal-header p { color: #b0b0b0; font-size: 1rem; line-height: 1.5; }
        .espn-import-modal .modal-body { padding: 30px; }
        .espn-import-modal .input-group { display: flex; flex-direction: column; gap: 15px; }
        .espn-import-modal .input-group label { color: #e31937; font-weight: 600; font-size: 1rem; }
        .espn-import-modal .input-group input { background: #0f0f1a; border: 2px solid #e31937; color: white; padding: 15px 20px; border-radius: 10px; font-size: 1rem; }
        .espn-import-modal .input-help { display: flex; align-items: center; gap: 8px; color: #b0b0b0; font-size: 0.9rem; }
        .espn-import-modal .modal-footer { padding: 20px 30px 30px; display: flex; gap: 15px; justify-content: flex-end; }
        .espn-import-modal .btn-cancel { padding: 12px 24px; background: #2a2a4a; color: #b0b0b0; border: 1px solid #4a4a6a; border-radius: 8px; cursor: pointer; }
        .espn-import-modal .btn-connect { padding: 12px 24px; background: linear-gradient(135deg, #e31937 0%, #c41230 100%); color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);
    const leagueIdInput = modal.querySelector('#espnLeagueId');
    const seasonInput = modal.querySelector('#espnSeason');
    const teamIdInput = modal.querySelector('#espnTeamId');
    leagueIdInput.focus();
    const connectBtn = modal.querySelector('#connectESPN');
    const cancelBtn = modal.querySelector('.btn-cancel');
    connectBtn.addEventListener('click', async () => {
        const leagueId = leagueIdInput.value.trim();
        const season = seasonInput.value.trim() || currentYear;
        const teamId = teamIdInput.value.trim() || null;
        if (!leagueId) {
            showNotification('Please enter your ESPN League ID.', 'warning');
            return;
        }
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        try {
            await apiController.connectESPNByLeagueId(leagueId, season, teamId);
            document.body.removeChild(modal);
            document.head.removeChild(style);
        } catch (err) {
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<i class="fas fa-link"></i> Import League';
            showNotification(err.message || 'ESPN import failed.', 'warning');
        }
    });
    cancelBtn.addEventListener('click', () => { document.body.removeChild(modal); document.head.removeChild(style); });
    modal.addEventListener('click', (e) => { if (e.target === modal) { document.body.removeChild(modal); document.head.removeChild(style); } });
    leagueIdInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') connectBtn.click(); });
}

function showYahooImportPopup() {
    const modal = document.createElement('div');
    modal.className = 'sleeper-modal yahoo-import-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fab fa-yahoo"></i> Import from Yahoo</h3>
                <p>Yahoo Fantasy requires sign-in for league data. You can try your League ID for public leagues.</p>
            </div>
            <div class="modal-body">
                <div class="input-group">
                    <label for="yahooLeagueKey">League ID / League Key</label>
                    <input type="text" id="yahooLeagueKey" placeholder="e.g. nfl.l.12345">
                    <div class="input-help">
                        <i class="fas fa-info-circle"></i>
                        <span>Find in your league URL. Full roster import may require Yahoo sign-in (coming later).</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel">Cancel</button>
                <button class="btn-connect" id="connectYahoo">
                    <i class="fas fa-link"></i> Try Import
                </button>
            </div>
        </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
        .yahoo-import-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(5px); }
        .yahoo-import-modal .modal-content { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 0; border-radius: 20px; border: 2px solid #6001d2; max-width: 450px; width: 90%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); overflow: hidden; }
        .yahoo-import-modal .modal-header { padding: 30px 30px 20px; text-align: center; border-bottom: 1px solid rgba(96,1,210,0.2); }
        .yahoo-import-modal .modal-header h3 { color: #6001d2; margin-bottom: 10px; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; gap: 10px; }
        .yahoo-import-modal .modal-header p { color: #b0b0b0; font-size: 1rem; line-height: 1.5; }
        .yahoo-import-modal .modal-body { padding: 30px; }
        .yahoo-import-modal .input-group { display: flex; flex-direction: column; gap: 15px; }
        .yahoo-import-modal .input-group label { color: #6001d2; font-weight: 600; font-size: 1rem; }
        .yahoo-import-modal .input-group input { background: #0f0f1a; border: 2px solid #6001d2; color: white; padding: 15px 20px; border-radius: 10px; font-size: 1rem; }
        .yahoo-import-modal .input-help { display: flex; align-items: center; gap: 8px; color: #b0b0b0; font-size: 0.9rem; }
        .yahoo-import-modal .modal-footer { padding: 20px 30px 30px; display: flex; gap: 15px; justify-content: flex-end; }
        .yahoo-import-modal .btn-cancel { padding: 12px 24px; background: #2a2a4a; color: #b0b0b0; border: 1px solid #4a4a6a; border-radius: 8px; cursor: pointer; }
        .yahoo-import-modal .btn-connect { padding: 12px 24px; background: linear-gradient(135deg, #6001d2 0%, #4a00a8 100%); color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);
    const leagueKeyInput = modal.querySelector('#yahooLeagueKey');
    leagueKeyInput.focus();
    const connectBtn = modal.querySelector('#connectYahoo');
    const cancelBtn = modal.querySelector('.btn-cancel');
    connectBtn.addEventListener('click', async () => {
        const key = leagueKeyInput.value.trim();
        if (!key) {
            showNotification('Please enter your Yahoo League ID or league key.', 'warning');
            return;
        }
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
        try {
            await apiController.connectYahooByLeagueId(key);
            document.body.removeChild(modal);
            document.head.removeChild(style);
        } catch (err) {
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<i class="fas fa-link"></i> Try Import';
            showNotification(err.message || 'Yahoo import failed.', 'warning');
        }
    });
    cancelBtn.addEventListener('click', () => { document.body.removeChild(modal); document.head.removeChild(style); });
    modal.addEventListener('click', (e) => { if (e.target === modal) { document.body.removeChild(modal); document.head.removeChild(style); } });
    leagueKeyInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') connectBtn.click(); });
}

function showProviderConnection(provider) {
    // Create a simple modal for provider connection
    const modal = document.createElement('div');
    modal.className = 'connection-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Connect to ${provider}</h3>
            <p>This feature will be available soon! For now, please use manual settings.</p>
            <button class="close-modal">Close</button>
        </div>
    `;
    
    // Add modal styles
    const style = document.createElement('style');
    style.textContent = `
        .connection-modal {
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
        }
        .modal-content {
            background: #1a1a2e;
            padding: 30px;
            border-radius: 15px;
            border: 2px solid #4a9eff;
            text-align: center;
            max-width: 400px;
        }
        .modal-content h3 {
            color: #4a9eff;
            margin-bottom: 15px;
        }
        .modal-content p {
            color: #b0b0b0;
            margin-bottom: 20px;
        }
        .close-modal {
            background: #4a9eff;
            color: #1a1a2e;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
        }
        .close-modal:hover {
            background: #6bb6ff;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
    
    // Close modal functionality
    modal.querySelector('.close-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
        document.head.removeChild(style);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
            document.head.removeChild(style);
        }
    });
}

function updateLeagueSettings() {
    const benchEl = document.getElementById('benchSpots');
    const flexEl = document.getElementById('flexSpots');
    const benchVal = benchEl ? parseInt(benchEl.value, 10) : 6;
    const flexVal = flexEl ? parseInt(flexEl.value, 10) : 1;
    const benchSpotsNum = isNaN(benchVal) || benchVal < 0 ? 6 : Math.min(10, Math.max(0, benchVal));
    const flexSpotsNum = isNaN(flexVal) || flexVal < 0 ? 1 : Math.min(8, Math.max(0, flexVal));
    if (benchEl && benchEl.value !== String(benchSpotsNum)) benchEl.value = benchSpotsNum;
    if (flexEl && flexEl.value !== String(flexSpotsNum)) flexEl.value = flexSpotsNum;
    const settings = {
        scoringFormat: document.getElementById('scoringFormat').value,
        leagueType: document.getElementById('leagueType').value,
        superflex: document.getElementById('superflex').checked,
        benchSpots: benchSpotsNum,
        flexSpots: flexSpotsNum
    };
    localStorage.setItem('leagueSettings', JSON.stringify(settings));
    showNotification('League settings saved!', 'success');
    if (window.apiController && typeof window.apiController.refreshBenchSlots === 'function') {
        window.apiController.refreshBenchSlots();
    }
}

// Analyze Team button
function setupAnalyzeTeam() {
    const btn = document.querySelector('.analyze-team-btn');
    if (btn) btn.addEventListener('click', analyzeTeam);
}

// Footer contact modal
function setupFooterContact() {
    const contactBtn = document.getElementById('footerContactBtn');
    if (!contactBtn) return;
    contactBtn.addEventListener('click', showContactModal);
}

function showContactModal() {
    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-labelledby', 'contact-modal-title');
    overlay.innerHTML = `
        <div class="contact-modal">
            <div class="contact-modal-header">
                <h3 id="contact-modal-title"><i class="fas fa-envelope"></i> Contact Us</h3>
                <p style="color:#b0b0b0;font-size:0.9rem;margin:0;">Send us a message and we'll get back to you.</p>
            </div>
            <form class="contact-form" id="contactForm">
                <div class="contact-modal-body">
                    <div class="form-group">
                        <label for="contactName">Name</label>
                        <input type="text" id="contactName" name="name" placeholder="Your name" required autocomplete="name">
                    </div>
                    <div class="form-group">
                        <label for="contactEmail">Email address</label>
                        <input type="email" id="contactEmail" name="email" placeholder="you@example.com" required autocomplete="email">
                    </div>
                    <div class="form-group">
                        <label for="contactMessage">Message</label>
                        <textarea id="contactMessage" name="message" placeholder="Your message..." required></textarea>
                    </div>
                </div>
                <div class="contact-modal-footer">
                    <button type="button" class="btn-cancel">Cancel</button>
                    <button type="submit" class="btn-submit"><i class="fas fa-paper-plane"></i> Send</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);

    const closeModal = () => {
        document.body.removeChild(overlay);
    };

    overlay.querySelector('.btn-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    overlay.querySelector('#contactForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = overlay.querySelector('#contactName').value.trim();
        const email = overlay.querySelector('#contactEmail').value.trim();
        const message = overlay.querySelector('#contactMessage').value.trim();
        if (!name || !email || !message) {
            showNotification('Please fill in name, email, and message.', 'warning');
            return;
        }
        closeModal();
        showNotification('Thank you! Your message has been received. We\'ll get back to you soon.', 'success');
    });
}

// Trade Analyzer Functionality
function setupTradeAnalyzer() {
    const analyzeBtn = document.querySelector('.analyze-btn');
    if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeTrade);

    // Wire up Add Player entry points for trade analyzer
    // Legacy support: buttons (if present)
    const addButtons = document.querySelectorAll('.add-trade-player-btn');
    addButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const side = btn.getAttribute('data-side') || 'giving';
            showGlobalAddPlayerModal({ mode: 'trade', side });
        });
    });

    // Current UI: clickable cards inside Trade Analyzer section
    const tradeAddCards = document.querySelectorAll('.trade-analyzer .add-trade-card');
    tradeAddCards.forEach(card => {
        card.addEventListener('click', () => {
            const side = card.getAttribute('data-side') || 'giving';
            if (typeof showGlobalAddPlayerModal === 'function') {
                showGlobalAddPlayerModal({ mode: 'trade', side });
            }
        });
    });
}

function filterPlayerList(listId, searchTerm) {
    const list = document.getElementById(listId);
    const items = list.querySelectorAll('.list-item');
    
    items.forEach(item => {
        const playerName = item.querySelector('h5').textContent.toLowerCase();
        const position = item.querySelector('p').textContent.toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        
        if (playerName.includes(searchLower) || position.includes(searchLower)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Trade Analyzer: Add Player Modal with Autocomplete
// Unified Add Player modal for both Trade and Lineup additions
function showGlobalAddPlayerModal(options) {
    const mode = options?.mode || 'trade'; // 'trade' | 'lineup'
    const side = options?.side || 'giving';
    const lineupPosition = options?.position || '';

    const modal = document.createElement('div');
    modal.className = 'add-trade-player-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-user-plus"></i> Add Player ${mode === 'trade' ? `(${side === 'giving' ? 'My Team' : 'Opponent'})` : (lineupPosition ? `(${lineupPosition})` : '')}</h3>
                <p>Search and select a player to add</p>
            </div>
            <div class="modal-body">
                <div class="search-row">
                    <input type="text" id="tradePlayerSearch" placeholder="Type a player name..." autocomplete="off" />
                </div>
                <div class="results-list" id="tradePlayerResults"></div>
            </div>
            <div class="modal-footer">
                <button class="btn-add" id="btnAddTradePlayer" disabled><i class="fas fa-plus"></i> Add Player</button>
                <button class="btn-cancel">Cancel</button>
            </div>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .add-trade-player-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
        .add-trade-player-modal .modal-content { background: #1a1a2e; border: 2px solid #4a9eff; border-radius: 16px; width: 90%; max-width: 560px; overflow: hidden; }
        .add-trade-player-modal .modal-header { padding: 20px 24px; border-bottom: 1px solid rgba(74,158,255,0.2); text-align: center; }
        .add-trade-player-modal .modal-header h3 { color: #4a9eff; margin-bottom: 6px; }
        .add-trade-player-modal .modal-header p { color: #b0b0b0; font-size: 0.95rem; }
        .add-trade-player-modal .modal-body { padding: 16px; }
        .add-trade-player-modal .search-row { margin-bottom: 12px; }
        .add-trade-player-modal input#tradePlayerSearch { width: 100%; background: #0f0f1a; border: 2px solid #4a9eff; color: #fff; padding: 12px 14px; border-radius: 10px; font-size: 1rem; }
        .add-trade-player-modal input#tradePlayerSearch:focus { outline: none; box-shadow: 0 0 10px rgba(74,158,255,0.35); }
        .add-trade-player-modal .results-list { max-height: 360px; overflow-y: auto; display: grid; gap: 8px; }
        .add-trade-player-modal .result-item { display: flex; align-items: center; gap: 12px; padding: 10px; background: rgba(74,158,255,0.08); border: 1px solid rgba(74,158,255,0.2); border-radius: 10px; cursor: pointer; transition: transform 0.15s ease, background 0.15s ease; }
        .add-trade-player-modal .result-item:hover { background: rgba(74,158,255,0.16); transform: translateY(-1px); }
        .add-trade-player-modal .result-item .avatar { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; border: 2px solid #4a9eff; flex-shrink: 0; }
        .add-trade-player-modal .result-item .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .add-trade-player-modal .result-item .meta { display: flex; flex-direction: column; }
        .add-trade-player-modal .result-item .meta .name { color: #fff; font-weight: 600; font-size: 0.95rem; }
        .add-trade-player-modal .result-item .meta .sub { color: #b0b0b0; font-size: 0.85rem; }
        .add-trade-player-modal .modal-footer { padding: 12px 16px 16px; display: flex; justify-content: flex-end; gap: 10px; }
        .add-trade-player-modal .btn-cancel { background: #2a2a4a; color: #b0b0b0; border: 1px solid #4a4a6a; padding: 10px 18px; border-radius: 8px; cursor: pointer; }
        .add-trade-player-modal .btn-cancel:hover { background: #3a3a5a; color: #fff; }
        .add-trade-player-modal .btn-add { background: #00d4aa; color: #0f0f1a; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-weight: 600; }
        .add-trade-player-modal .btn-add:disabled { opacity: 0.6; cursor: not-allowed; }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    const input = modal.querySelector('#tradePlayerSearch');
    const results = modal.querySelector('#tradePlayerResults');
    const cancelBtn = modal.querySelector('.btn-cancel');
    const addBtn = modal.querySelector('#btnAddTradePlayer');

    const closeModal = () => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
        if (document.head.contains(style)) document.head.removeChild(style);
    };

    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    let searchTimeout;
    let selectedIndex = -1;
    let currentResults = [];
    input.addEventListener('input', async function() {
        clearTimeout(searchTimeout);
        const query = this.value.trim();
        if (!query) { results.innerHTML = ''; return; }
        searchTimeout = setTimeout(async () => {
            const matches = await universalPlayerSearch(query);
            currentResults = matches;
            selectedIndex = matches.length ? 0 : -1;
            const useClickCallback = mode === 'lineup';
            renderTradeSearchResults(
                matches,
                side,
                results,
                closeModal,
                () => selectedIndex,
                useClickCallback
                    ? (idx) => {
                          selectedIndex = idx;
                          updateAddButtonState();
                          addSelected();
                      }
                    : null
            );
            updateAddButtonState();
        }, 180);
    });
    input.focus();

    input.addEventListener('keydown', (e) => {
        const max = currentResults.length - 1;
        if (e.key === 'ArrowDown' && max >= 0) {
            e.preventDefault();
            selectedIndex = Math.min(max, selectedIndex + 1);
            highlightSelected(results, selectedIndex);
            updateAddButtonState();
        } else if (e.key === 'ArrowUp' && max >= 0) {
            e.preventDefault();
            selectedIndex = Math.max(0, selectedIndex - 1);
            highlightSelected(results, selectedIndex);
            updateAddButtonState();
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            addSelected();
        }
    });

    addBtn.addEventListener('click', addSelected);

    function updateAddButtonState() {
        addBtn.disabled = !(selectedIndex >= 0 && currentResults[selectedIndex]);
    }

    function addSelected() {
        if (!(selectedIndex >= 0 && currentResults[selectedIndex])) return;
        const m = currentResults[selectedIndex];
        const rating = (Math.random() * 15 + 80).toFixed(1);
        if (mode === 'trade') {
            const tradeAdded = addTradePlayer(side, { name: m.full_name, position: m.position, rating, id: m.id, team: m.team });
            if (tradeAdded) closeModal();
        } else {
            const slotPosition = lineupPosition || m.position || 'FLEX';
            const playerPos = (m.position || '').trim();
            if (slotPosition !== 'BENCH' && !isPlayerPositionAllowedForSlot(playerPos, slotPosition)) {
                showNotification(
                    playerPos
                        ? `${m.full_name} (${playerPos}) cannot be added to ${slotPosition}. Use the correct position slot or FLEX.`
                        : `Select a player with a valid position for ${slotPosition}.`,
                    'warning'
                );
                return;
            }
            const controller = apiController || window.apiController;
            if (controller && typeof controller.addPlayerToLineup === 'function') {
                const added = controller.addPlayerToLineup(slotPosition, {
                    full_name: m.full_name,
                    position: m.position || slotPosition,
                    team: m.team || '',
                    id: m.id,
                    image: getPlayerOrTeamImageUrl(m)
                });
                if (added === true) closeModal();
                else if (added === 'duplicate') showNotification(m.full_name + ' is already in your lineup or bench.', 'warning');
                else showNotification('Could not add player to ' + slotPosition + '. That slot may already be filled.', 'warning');
            } else {
                showNotification('Unable to add player to lineup. Please try again.', 'warning');
            }
        }
    }
}

// ESPN NFL players dataset (cached once) – built from team rosters so position + team are always present
let _espnPlayersCache = null;
async function loadEspnPlayers() {
    if (_espnPlayersCache) return _espnPlayersCache;
    const teamsRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams');
    if (!teamsRes.ok) throw new Error(`ESPN teams fetch failed: ${teamsRes.status}`);
    const teamsData = await teamsRes.json();
    const teams = [];
    try {
        const leagues = teamsData.sports?.[0]?.leagues || [];
        for (const league of leagues) {
            const list = league.teams || [];
            for (const t of list) {
                const team = t.team || t;
                if (team.id && team.abbreviation) teams.push({ id: team.id, abbreviation: team.abbreviation });
            }
        }
    } catch (e) {
        console.warn('ESPN teams parse error', e);
    }
    const allPlayers = [];
    for (const team of teams) {
        try {
            const rosterRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`);
            if (!rosterRes.ok) continue;
            const roster = await rosterRes.json();
            const groups = roster.athletes || [];
            for (const group of groups) {
                const items = group.items || [];
                for (const it of items) {
                    const pos = it.position;
                    const positionStr = (pos && (pos.abbreviation || pos.displayName || pos.name)) || '';
                    const name = it.fullName || it.displayName || it.shortName || it.name || '';
                    if (!name || !it.id) continue;
                    allPlayers.push({
                        id: String(it.id),
                        full_name: name,
                        position: positionStr,
                        team: team.abbreviation
                    });
                }
            }
        } catch (e) {
            console.warn(`ESPN roster fetch failed for team ${team.id}`, e);
        }
    }
    _espnPlayersCache = allPlayers;
    return _espnPlayersCache;
}

// NFL teams as "team defense" options (cached)
let _nflTeamDefensesCache = null;
async function loadNflTeamDefenses() {
    if (_nflTeamDefensesCache) return _nflTeamDefensesCache;
    try {
        const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams');
        if (!res.ok) return [];
        const data = await res.json();
        const teams = [];
        const leagues = data.sports?.[0]?.leagues || [];
        for (const league of leagues) {
            const list = league.teams || [];
            for (const t of list) {
                const team = t.team || t;
                if (team.id && team.abbreviation) {
                    teams.push({
                        id: 'T' + team.id,
                        full_name: team.displayName || team.name || team.abbreviation + ' Defense',
                        position: 'DEF',
                        team: team.abbreviation,
                        isTeamDefense: true
                    });
                }
            }
        }
        _nflTeamDefensesCache = teams;
        return _nflTeamDefensesCache;
    } catch (e) {
        console.warn('Failed to load NFL teams for defense', e);
        return [];
    }
}

async function universalPlayerSearch(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    try {
        const [playerList, teamDefenses] = await Promise.all([
            loadEspnPlayers(),
            loadNflTeamDefenses()
        ]);
        const out = [];
        for (let i = 0; i < playerList.length; i++) {
            const p = playerList[i];
            if (p.full_name && p.full_name.toLowerCase().includes(q)) {
                out.push(p);
                if (out.length >= 25) break;
            }
        }
        // Add matching team defenses (e.g. "Ravens" -> Baltimore Ravens DEF)
        for (const t of teamDefenses) {
            const name = (t.full_name || '').toLowerCase();
            const abbr = (t.team || '').toLowerCase();
            if (name.includes(q) || abbr === q || name.startsWith(q) || name.split(/\s+/).some(part => part.startsWith(q))) {
                out.push(t);
                if (out.length >= 30) break;
            }
        }
        return out.slice(0, 30);
    } catch (e) {
        console.error('universalPlayerSearch error:', e);
        return [];
    }
}

function getEspnHeadshotUrl(id) {
    if (!id) return '';
    return `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
}

function getPlayerOrTeamImageUrl(item) {
    if (!item) return '';
    if (item.isTeamDefense && item.team)
        return `https://a.espncdn.com/i/teamlogos/nfl/500/${item.team.toLowerCase()}.png`;
    if (item.id && String(item.id).startsWith('T') && item.team)
        return `https://a.espncdn.com/i/teamlogos/nfl/500/${item.team.toLowerCase()}.png`;
    return getEspnHeadshotUrl(item.id);
}

function getPlayerInitials(name) {
    if (!name || typeof name !== 'string') return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 3);
}

function getPlayerPlaceholderUrl(name, size = 128) {
    const initials = getPlayerInitials(name);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=${size}&background=1a1a2e&color=4a9eff`;
}

// Position validation: which player positions are allowed in each lineup slot (FLEX = all skill positions)
function getAllowedPositionsForSlot(slotPosition) {
    const slot = (slotPosition || '').toUpperCase();
    const map = {
        QB: ['QB'],
        RB: ['RB'],
        WR: ['WR'],
        TE: ['TE'],
        K: ['K', 'PK'],
        DEF: ['DEF', 'DST', 'D', 'DE', 'DT', 'NT', 'LB', 'S', 'CB'],
        FLEX: ['QB', 'RB', 'WR', 'TE', 'K'],
        SUPER_FLEX: ['QB', 'RB', 'WR', 'TE', 'K']
    };
    return map[slot] || [];
}

function isPlayerPositionAllowedForSlot(playerPosition, slotPosition) {
    if (!slotPosition) return true;
    const slot = (slotPosition || '').toUpperCase();
    if (slot === 'FLEX' || slot === 'SUPER_FLEX') return true; // flex slots: any skill (superflex includes QB)
    const allowed = getAllowedPositionsForSlot(slot);
    const pos = (playerPosition || '').toUpperCase();
    if (!pos) return false;
    return allowed.some(a => pos === a || pos.startsWith(a) || a.startsWith(pos));
}

// Preload player headshots so they're in browser cache when displayed (search + trade list)
function preloadPlayerImages(players) {
    if (!Array.isArray(players) || players.length === 0) return;
    players.slice(0, 30).forEach(p => {
        if (p.isTeamDefense || (p.id && String(p.id).startsWith('T'))) return;
        const id = p.id || p.player_id;
        if (!id) return;
        const img = new Image();
        img.src = getEspnHeadshotUrl(id);
    });
}

function renderTradeSearchResults(matches, side, resultsEl, closeModal, getSelectedIndex, onItemChosen) {
    if (!Array.isArray(matches)) { resultsEl.innerHTML = ''; return; }
    const placeholderFallback = matches.map(m => getPlayerPlaceholderUrl(m.full_name, 36));
    resultsEl.innerHTML = matches.map((m, i) => {
        const avatar = getPlayerOrTeamImageUrl(m);
        const fallback = placeholderFallback[i] || getPlayerPlaceholderUrl(m.full_name, 36);
        return `
            <div class="result-item" data-id="${m.id}" data-name="${m.full_name}" data-pos="${m.position || ''}" data-team="${m.team || ''}" data-team-defense="${m.isTeamDefense ? '1' : ''}">
                <div class="avatar"><img src="${avatar}" alt="${m.full_name}" onerror="this.onerror=null;this.src='${fallback}';"/></div>
                <div class="meta">
                    <span class="name">${m.full_name}</span>
                    <span class="sub">${m.position || '-'}${m.team ? ' • ' + m.team : ''}</span>
                </div>
            </div>
        `;
    }).join('');
    preloadPlayerImages(matches);

    const items = resultsEl.querySelectorAll('.result-item');
    const applyHighlight = () => {
        const sel = (getSelectedIndex && getSelectedIndex()) || -1;
        items.forEach((it, idx) => {
            if (idx === sel) it.classList.add('selected');
            else it.classList.remove('selected');
        });
    };
    applyHighlight();

    items.forEach((item, idx) => {
        item.addEventListener('click', () => {
            if (typeof onItemChosen === 'function') {
                onItemChosen(idx);
            } else {
                const name = item.getAttribute('data-name');
                const position = item.getAttribute('data-pos');
                const id = item.getAttribute('data-id');
                const team = item.getAttribute('data-team');
                const rating = (Math.random() * 15 + 80).toFixed(1);
                const added = addTradePlayer(side, { name, position, rating, id: id || undefined, team: team || undefined });
                if (added) closeModal();
            }
        });
        item.addEventListener('mouseenter', () => {
            items.forEach(it => it.classList.remove('selected'));
            item.classList.add('selected');
        });
    });
} 

function ensureTradeAnalysisContainer() {
    let tradeAnalysis = document.querySelector('.trade-analysis-container');
    if (!tradeAnalysis) {
        tradeAnalysis = document.createElement('div');
        tradeAnalysis.className = 'trade-analysis-container';
        tradeAnalysis.innerHTML = `
            <h3>Trade Analysis</h3>
            <div class="trade-players">
                <div class="giving-players">
                    <h4>Giving</h4>
                    <div class="players-list" id="givingList"></div>
                </div>
                <div class="receiving-players">
                    <h4>Receiving</h4>
                    <div class="players-list" id="receivingList"></div>
                </div>
            </div>
            <div class="trade-summary">
                <div class="summary-stats">
                    <div class="stat">
                        <span class="label">Trade Value:</span>
                        <span class="value" id="tradeValue">0</span>
                    </div>
                    <div class="stat">
                        <span class="label">Fairness:</span>
                        <span class="value" id="fairness">-</span>
                    </div>
                </div>
            </div>
        `;
        const style = document.createElement('style');
        style.textContent = `
            .trade-analysis-container { background: rgba(26,26,46,0.8); border-radius: 15px; padding: 25px; margin-top: 30px; border: 1px solid rgba(74,158,255,0.2); }
            .trade-analysis-container h3 { color: #4a9eff; margin-bottom: 20px; text-align: center; }
            .trade-players { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .giving-players h4, .receiving-players h4 { color: #6bb6ff; margin-bottom: 15px; text-align: center; }
            .players-list { min-height: 100px; border: 1px solid rgba(74,158,255,0.2); border-radius: 8px; padding: 10px; background: rgba(26,26,46,0.5); }
            .trade-summary { border-top: 1px solid rgba(74,158,255,0.2); padding-top: 20px; }
            .summary-stats { display: flex; justify-content: space-around; }
            .stat { text-align: center; }
            .stat .label { display: block; color: #b0b0b0; font-size: 0.9rem; margin-bottom: 5px; }
            .stat .value { display: block; color: #4a9eff; font-size: 1.2rem; font-weight: 600; }
        `;
        document.head.appendChild(style);
        const tradeAnalyzer = document.querySelector('.trade-analyzer');
        tradeAnalyzer.insertBefore(tradeAnalysis, tradeAnalyzer.querySelector('.trade-analysis'));
    }
}

function addTradePlayer(side, data) {
    ensureTradeAnalysisContainer();
    const targetListId = side === 'receiving' ? 'receivingList' : 'givingList';
    const target = document.getElementById(targetListId);
    if (!target) return false;

    // Prevent duplicate: same player already in this side's list
    const newId = data.id != null ? String(data.id) : '';
    const newKey = (data.name || '') + '|' + (data.team || '');
    const existing = target.querySelectorAll('.trade-player-item');
    for (const item of existing) {
        const existingId = item.getAttribute('data-player-id') || '';
        const existingName = item.getAttribute('data-player-name') || '';
        const existingTeam = item.getAttribute('data-player-team') || '';
        const existingKey = existingName + '|' + existingTeam;
        if (newId && existingId && newId === existingId) {
            showNotification((data.name || 'Player') + ' is already in this side of the trade.', 'warning');
            return false;
        }
        if (newKey && existingKey && newKey === existingKey) {
            showNotification((data.name || 'Player') + ' is already in this side of the trade.', 'warning');
            return false;
        }
    }

    const avatarSrc = getPlayerOrTeamImageUrl({ id: data.id, team: data.team, full_name: data.name, isTeamDefense: data.id && String(data.id).startsWith('T') }) || getPlayerPlaceholderUrl(data.name, 48);
    const placeholderSrc = getPlayerPlaceholderUrl(data.name, 48);
    const safeName = (data.name || '').replace(/"/g, '&quot;');

    const el = document.createElement('div');
    el.className = 'trade-player-item';
    if (data.id != null) el.setAttribute('data-player-id', String(data.id));
    el.setAttribute('data-player-name', data.name || '');
    el.setAttribute('data-player-team', data.team || '');
    el.innerHTML = `
        <div class="trade-player-avatar">
            <img src="${avatarSrc}" alt="${safeName}" onerror="this.onerror=null;this.src='${placeholderSrc}';"/>
        </div>
        <div class="player-info">
            <strong>${data.name}</strong>
            <span>${data.position || '-'}${data.team ? ' • ' + data.team : ''}</span>
        </div>
        <div class="player-rating">${data.rating}</div>
        <button class="remove-btn">×</button>
    `;

    // Minimal styles if not already present
    const itemStyle = document.createElement('style');
    itemStyle.textContent = `
        .trade-player-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: rgba(74,158,255,0.1); border-radius: 6px; margin-bottom: 8px; border: 1px solid rgba(74,158,255,0.2); }
        .trade-player-item .trade-player-avatar { width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 2px solid rgba(74,158,255,0.4); }
        .trade-player-item .trade-player-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .trade-player-item .player-info { flex: 1; min-width: 0; }
        .trade-player-item .player-info strong { color: #ffffff; display: block; font-size: 0.9rem; }
        .trade-player-item .player-info span { color: #b0b0b0; font-size: 0.8rem; }
        .trade-player-item .player-rating { background: #4a9eff; color: #1a1a2e; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; margin: 0 10px; flex-shrink: 0; }
        .remove-btn { background: #ff4757; color: white; border: none; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .remove-btn:hover { background: #ff3742; }
        .add-trade-player-modal .result-item.selected { outline: 2px solid #4a9eff; }
    `;
    document.head.appendChild(itemStyle);

    target.appendChild(el);
    el.querySelector('.remove-btn').addEventListener('click', () => { el.remove(); updateTradeAnalysis(); });
    updateTradeAnalysis();
    return true;
}

function setupAddPlayerButtons() {
    const addButtons = document.querySelectorAll('.add-btn');
    
    addButtons.forEach(button => {
        button.addEventListener('click', function() {
            const listItem = this.closest('.list-item');
            const playerName = listItem.querySelector('h5').textContent;
            const playerPosition = listItem.querySelector('p').textContent;
            const playerRating = listItem.querySelector('.rating').textContent;
            
            // Add to trade analysis
            addPlayerToTrade(listItem, playerName, playerPosition, playerRating);
            
            // Update button state
            this.textContent = '✓';
            this.style.background = '#00d4aa';
            this.disabled = true;
        });
    });
}

function addPlayerToTrade(listItem, name, position, rating) {
    // Create trade analysis container if it doesn't exist
    let tradeAnalysis = document.querySelector('.trade-analysis-container');
    if (!tradeAnalysis) {
        tradeAnalysis = document.createElement('div');
        tradeAnalysis.className = 'trade-analysis-container';
        tradeAnalysis.innerHTML = `
            <h3>Trade Analysis</h3>
            <div class="trade-players">
                <div class="giving-players">
                    <h4>Giving</h4>
                    <div class="players-list" id="givingList"></div>
                </div>
                <div class="receiving-players">
                    <h4>Receiving</h4>
                    <div class="players-list" id="receivingList"></div>
                </div>
            </div>
            <div class="trade-summary">
                <div class="summary-stats">
                    <div class="stat">
                        <span class="label">Trade Value:</span>
                        <span class="value" id="tradeValue">0</span>
                    </div>
                    <div class="stat">
                        <span class="label">Fairness:</span>
                        <span class="value" id="fairness">-</span>
                    </div>
                </div>
            </div>
        `;
        
        // Add styles for trade analysis
        const style = document.createElement('style');
        style.textContent = `
            .trade-analysis-container {
                background: rgba(26, 26, 46, 0.8);
                border-radius: 15px;
                padding: 25px;
                margin-top: 30px;
                border: 1px solid rgba(74, 158, 255, 0.2);
            }
            .trade-analysis-container h3 {
                color: #4a9eff;
                margin-bottom: 20px;
                text-align: center;
            }
            .trade-players {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 20px;
            }
            .giving-players h4,
            .receiving-players h4 {
                color: #6bb6ff;
                margin-bottom: 15px;
                text-align: center;
            }
            .players-list {
                min-height: 100px;
                border: 1px solid rgba(74, 158, 255, 0.2);
                border-radius: 8px;
                padding: 10px;
                background: rgba(26, 26, 46, 0.5);
            }
            .trade-summary {
                border-top: 1px solid rgba(74, 158, 255, 0.2);
                padding-top: 20px;
            }
            .summary-stats {
                display: flex;
                justify-content: space-around;
            }
            .stat {
                text-align: center;
            }
            .stat .label {
                display: block;
                color: #b0b0b0;
                font-size: 0.9rem;
                margin-bottom: 5px;
            }
            .stat .value {
                display: block;
                color: #4a9eff;
                font-size: 1.2rem;
                font-weight: 600;
            }
        `;
        document.head.appendChild(style);
        
        // Insert before the analyze button
        const tradeAnalyzer = document.querySelector('.trade-analyzer');
        tradeAnalyzer.insertBefore(tradeAnalysis, tradeAnalyzer.querySelector('.trade-analysis'));
    }
    
    // Determine which list to add to based on the original list
    const isMyTeam = listItem.closest('#myTeamList') !== null;
    const targetList = isMyTeam ? 'givingList' : 'receivingList';
    
    const playerElement = document.createElement('div');
    playerElement.className = 'trade-player-item';
    playerElement.innerHTML = `
        <div class="player-info">
            <strong>${name}</strong>
            <span>${position}</span>
        </div>
        <div class="player-rating">${rating}</div>
        <button class="remove-btn">×</button>
    `;
    
    // Add styles for trade player items
    const itemStyle = document.createElement('style');
    itemStyle.textContent = `
        .trade-player-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: rgba(74, 158, 255, 0.1);
            border-radius: 6px;
            margin-bottom: 8px;
            border: 1px solid rgba(74, 158, 255, 0.2);
        }
        .trade-player-item .player-info {
            flex: 1;
        }
        .trade-player-item .player-info strong {
            color: #ffffff;
            display: block;
            font-size: 0.9rem;
        }
        .trade-player-item .player-info span {
            color: #b0b0b0;
            font-size: 0.8rem;
        }
        .trade-player-item .player-rating {
            background: #4a9eff;
            color: #1a1a2e;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.8rem;
            font-weight: 600;
            margin: 0 10px;
        }
        .remove-btn {
            background: #ff4757;
            color: white;
            border: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .remove-btn:hover {
            background: #ff3742;
        }
    `;
    document.head.appendChild(itemStyle);
    
    document.getElementById(targetList).appendChild(playerElement);
    
    // Add remove functionality
    playerElement.querySelector('.remove-btn').addEventListener('click', function() {
        playerElement.remove();
        updateTradeAnalysis();
    });
    
    updateTradeAnalysis();
}

function updateTradeAnalysis() {
    const givingList = document.getElementById('givingList');
    const receivingList = document.getElementById('receivingList');
    
    if (!givingList || !receivingList) return;
    
    const givingPlayers = givingList.querySelectorAll('.trade-player-item');
    const receivingPlayers = receivingList.querySelectorAll('.trade-player-item');
    
    // Calculate trade value (simplified)
    let givingValue = 0;
    let receivingValue = 0;
    
    givingPlayers.forEach(player => {
        const rating = parseFloat(player.querySelector('.player-rating')?.textContent || '0');
        givingValue += Number.isNaN(rating) ? 0 : rating;
    });
    
    receivingPlayers.forEach(player => {
        const rating = parseFloat(player.querySelector('.player-rating')?.textContent || '0');
        receivingValue += Number.isNaN(rating) ? 0 : rating;
    });
    
    const tradeValue = receivingValue - givingValue;
    const fairness = Math.abs(tradeValue) < 5 ? 'Fair' : tradeValue > 0 ? 'Favorable' : 'Unfavorable';
    
    const tradeValueEl = document.getElementById('tradeValue');
    const fairnessEl = document.getElementById('fairness');
    if (tradeValueEl) tradeValueEl.textContent = tradeValue.toFixed(1);
    if (fairnessEl) {
        fairnessEl.textContent = fairness;
        fairnessEl.style.color = fairness === 'Fair' ? '#00d4aa' : fairness === 'Favorable' ? '#4a9eff' : '#ff4757';
    }
}

async function analyzeTrade() {
    const givingList = document.getElementById('givingList');
    const receivingList = document.getElementById('receivingList');
    
    if (!givingList || !receivingList) {
        showNotification('Please add players to both sides of the trade', 'warning');
        return;
    }
    
    const givingPlayersEls = givingList.querySelectorAll('.trade-player-item');
    const receivingPlayersEls = receivingList.querySelectorAll('.trade-player-item');
    
    if (givingPlayersEls.length === 0 || receivingPlayersEls.length === 0) {
        showNotification('Please add players to both sides of the trade', 'warning');
        return;
    }

    const analyzeBtn = document.querySelector('.analyze-btn');
    let originalLabel = '';
    if (analyzeBtn) {
        originalLabel = analyzeBtn.innerHTML;
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
    }

    try {
        // Local numeric analysis as a baseline
        const baseAnalysis = performTradeAnalysis(givingPlayersEls, receivingPlayersEls);

        // Build lightweight payload for AI
        const giving = Array.from(givingPlayersEls).map(el => ({
            name: el.querySelector('.player-info strong')?.textContent || '',
            position: el.querySelector('.player-info span')?.textContent || '',
            rating: parseFloat(el.querySelector('.player-rating')?.textContent || '0')
        }));
        const receiving = Array.from(receivingPlayersEls).map(el => ({
            name: el.querySelector('.player-info strong')?.textContent || '',
            position: el.querySelector('.player-info span')?.textContent || '',
            rating: parseFloat(el.querySelector('.player-rating')?.textContent || '0')
        }));

        let aiResult = null;
        if (apiController && typeof apiController.analyzeTradeWithOpenAI === 'function') {
            try {
                aiResult = await apiController.analyzeTradeWithOpenAI(giving, receiving);
            } catch (err) {
                console.error('AI trade analysis failed, falling back to local analysis only:', err);
                const msg = (err && err.message) || String(err);
                showNotification(`AI analysis: ${msg}`, 'warning');
            }
        }

        try {
            showTradeAnalysisModal({
                ...baseAnalysis,
                ai: aiResult
            });
        } catch (err) {
            console.error('Could not show trade results:', err);
            showNotification('Could not show the analysis window. See console for details.', 'warning');
        }
    } finally {
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = originalLabel || '<i class="fas fa-chart-line"></i> Analyze Trade';
        }
    }
}

function performTradeAnalysis(givingPlayers, receivingPlayers) {
    // Simplified analysis - in a real app, this would use advanced algorithms
    let givingValue = 0;
    let receivingValue = 0;
    let givingCount = givingPlayers.length;
    let receivingCount = receivingPlayers.length;
    
    givingPlayers.forEach(player => {
        const rating = parseFloat(player.querySelector('.player-rating')?.textContent || '0');
        if (!Number.isNaN(rating)) givingValue += rating;
    });
    
    receivingPlayers.forEach(player => {
        const rating = parseFloat(player.querySelector('.player-rating')?.textContent || '0');
        if (!Number.isNaN(rating)) receivingValue += rating;
    });
    
    const netValue = receivingValue - givingValue;
    const avgGiving = givingValue / givingCount;
    const avgReceiving = receivingValue / receivingCount;
    
    return {
        netValue: netValue.toFixed(1),
        avgGiving: avgGiving.toFixed(1),
        avgReceiving: avgReceiving.toFixed(1),
        fairness: Math.abs(netValue) < 5 ? 'Fair' : netValue > 0 ? 'Favorable' : 'Unfavorable',
        recommendation: getTradeRecommendation(netValue)
    };
}

function getTradeRecommendation(netValue) {
    if (Math.abs(netValue) < 5) {
        return 'This is a fair trade. Both sides get similar value.';
    } else if (netValue > 10) {
        return 'This trade heavily favors you. Consider accepting!';
    } else if (netValue > 0) {
        return 'This trade slightly favors you. Good value.';
    } else if (netValue > -10) {
        return 'This trade slightly favors your opponent. Consider negotiating.';
    } else {
        return 'This trade heavily favors your opponent. Not recommended.';
    }
}

function showTradeAnalysisModal(analysis) {
    const modal = document.createElement('div');
    modal.className = 'analysis-modal';
    const ai = analysis.ai || null;
    const fairnessRaw = (ai && ai.fairness != null && ai.fairness !== '') ? ai.fairness : analysis.fairness;
    const fairnessLabel = String(fairnessRaw != null ? fairnessRaw : 'Fair');
    const fl = fairnessLabel.trim().toLowerCase();
    const fairnessClass = ['fair', 'favorable', 'unfavorable'].includes(fl) ? fl : 'fair';
    const summaryFromAi = ai && typeof ai.summary === 'string' && ai.summary.length > 0;
    const recommendationText = summaryFromAi ? ai.summary : (analysis.recommendation || '');
    const aiGrade = ai && typeof ai.grade === 'number' ? ai.grade.toFixed(1) : null;
    const netValueNumeric = parseFloat(String(analysis.netValue));
    const netDisplay = (analysis && analysis.netValue != null) ? String(analysis.netValue) : '0.0';
    const sign = !Number.isNaN(netValueNumeric) && netValueNumeric > 0 ? '+' : '';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Trade Analysis Results</h3>
            <div class="analysis-results">
                <div class="result-item">
                    <span class="label">Net Value:</span>
                    <span class="value ${!Number.isNaN(netValueNumeric) && netValueNumeric > 0 ? 'positive' : 'negative'}">${sign}${netDisplay}</span>
                </div>
                <div class="result-item">
                    <span class="label">Your Average:</span>
                    <span class="value">${String(analysis.avgGiving != null ? analysis.avgGiving : '')}</span>
                </div>
                <div class="result-item">
                    <span class="label">Their Average:</span>
                    <span class="value">${String(analysis.avgReceiving != null ? analysis.avgReceiving : '')}</span>
                </div>
                <div class="result-item">
                    <span class="label">Fairness:</span>
                    <span class="value ${fairnessClass}">${fairnessLabel}</span>
                </div>
                ${aiGrade !== null ? `
                <div class="result-item">
                    <span class="label">AI Grade (0–100):</span>
                    <span class="value">${aiGrade}</span>
                </div>` : ''}
            </div>
            <div class="recommendation">
                <h4 class="recommendation-heading"></h4>
                <p class="recommendation-body"></p>
            </div>
            <button class="close-modal">Close</button>
        </div>
    `;
    const h4 = modal.querySelector('.recommendation-heading');
    const p = modal.querySelector('.recommendation-body');
    if (h4) h4.textContent = ai ? 'AI Recommendation:' : 'Recommendation:';
    if (p) p.textContent = recommendationText;
    
    // Add modal styles
    const style = document.createElement('style');
    style.textContent = `
        .analysis-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10050;
        }
        .analysis-modal .modal-content {
            background: #1a1a2e;
            padding: 30px;
            border-radius: 15px;
            border: 2px solid #4a9eff;
            text-align: center;
            max-width: 500px;
            width: 90%;
        }
        .analysis-modal h3 {
            color: #4a9eff;
            margin-bottom: 20px;
        }
        .analysis-results {
            display: grid;
            gap: 15px;
            margin-bottom: 20px;
        }
        .result-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background: rgba(74, 158, 255, 0.1);
            border-radius: 8px;
        }
        .result-item .label {
            color: #b0b0b0;
            font-weight: 500;
        }
        .result-item .value {
            font-weight: 600;
            font-size: 1.1rem;
        }
        .result-item .value.positive {
            color: #00d4aa;
        }
        .result-item .value.negative {
            color: #ff4757;
        }
        .result-item .value.fair {
            color: #4a9eff;
        }
        .result-item .value.favorable {
            color: #00d4aa;
        }
        .result-item .value.unfavorable {
            color: #ff4757;
        }
        .recommendation {
            background: rgba(74, 158, 255, 0.1);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .recommendation h4 {
            color: #4a9eff;
            margin-bottom: 10px;
        }
        .recommendation p {
            color: #b0b0b0;
            line-height: 1.5;
        }
        .close-modal {
            background: #4a9eff;
            color: #1a1a2e;
            border: none;
            padding: 12px 25px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 1rem;
        }
        .close-modal:hover {
            background: #6bb6ff;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
    
    // Close modal functionality
    modal.querySelector('.close-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
        document.head.removeChild(style);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
            document.head.removeChild(style);
        }
    });
}

function getLineupAndBenchPlayers() {
    const lineupCards = document.querySelectorAll('.lineup-section .player-card:not(.placeholder)');
    const benchCards = document.querySelectorAll('.bench-section .player-card');
    const toPlayer = (card) => {
        const name = card.querySelector('.player-info h5')?.textContent?.trim() || '';
        const posLine = card.querySelector('.player-info p.position')?.textContent?.trim() || '';
        const rating = parseFloat(card.querySelector('.player-info .rating')?.textContent || '0') || 0;
        const slot = card.getAttribute('data-slot-position') || '';
        const parts = posLine.split(/\s*-\s*/);
        const position = parts[0]?.trim() || '';
        const team = parts[1]?.trim() || '';
        return { name, position, team, rating, slot };
    };
    const lineup = Array.from(lineupCards).map(toPlayer);
    const bench = Array.from(benchCards).map(toPlayer);
    return { lineup, bench };
}

async function analyzeTeam() {
    const { lineup, bench } = getLineupAndBenchPlayers();
    const total = lineup.length + bench.length;
    if (total === 0) {
        showNotification('Add players to your lineup and bench to analyze your team.', 'warning');
        return;
    }

    const btn = document.querySelector('.analyze-team-btn');
    const originalLabel = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
    }

    try {
        let result = null;
        if (apiController && typeof apiController.analyzeTeamWithOpenAI === 'function') {
            try {
                result = await apiController.analyzeTeamWithOpenAI(lineup, bench);
            } catch (err) {
                console.error('AI team analysis failed:', err);
                showNotification(err.message || 'AI analysis failed. Check your API key.', 'warning');
            }
        }
        if (!result) {
            showNotification('OpenAI API key is required for team analysis.', 'warning');
            return;
        }
        showTeamAnalysisResult(result);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalLabel || '<i class="fas fa-chart-pie"></i> Analyze Team';
        }
    }
}

function showTeamAnalysisResult(result) {
    const container = document.getElementById('teamAnalysisResponse');
    if (!container) return;

    const normalizeItems = (value) => {
        if (Array.isArray(value)) {
            return value.map(item => String(item || '').trim()).filter(Boolean);
        }
        const text = String(value || '').trim();
        if (!text) return [];
        return text
            .split(/\n+|,\s+(?=[A-Z0-9])|;\s+|\.\s+(?=[A-Z])/)
            .map(item => item.trim().replace(/\.$/, ''))
            .filter(Boolean);
    };

    const sections = [
        ['Team Strengths', normalizeItems(result.strengths)],
        ['Team Weaknesses', normalizeItems(result.weaknesses || result.needsHelp)],
        ['Trade Targets', normalizeItems(result.tradeTargets)],
        ['Players to Trade Away', normalizeItems(result.tradeAway)],
        ['Drop Candidates', normalizeItems(result.dropCandidates)]
    ].filter(([, items]) => items.length > 0);
    const overallSummary = String(result.overallSummary || '').trim();
    const nextActions = normalizeItems(result.nextActions);

    container.hidden = false;
    container.innerHTML = `
        <div class="team-analysis-response-header">
            <i class="fas fa-chart-pie"></i>
            <h3>Team Analysis</h3>
        </div>
        <div class="team-analysis-response-body"></div>
    `;

    const body = container.querySelector('.team-analysis-response-body');
    sections.forEach(([title, items]) => {
        const section = document.createElement('div');
        section.className = 'team-analysis-response-section';

        const heading = document.createElement('h4');
        heading.textContent = title;

        const list = document.createElement('ul');
        list.className = 'team-analysis-response-list';
        items.forEach((item) => {
            const entry = document.createElement('li');
            entry.textContent = item;
            list.appendChild(entry);
        });

        section.appendChild(heading);
        section.appendChild(list);
        body.appendChild(section);
    });

    if (overallSummary || nextActions.length > 0) {
        const summary = document.createElement('div');
        summary.className = 'team-analysis-summary';

        const heading = document.createElement('h4');
        heading.textContent = 'Overall team summary';

        summary.appendChild(heading);

        if (overallSummary) {
            const content = document.createElement('p');
            content.className = 'team-analysis-summary-overview';
            content.textContent = overallSummary;
            summary.appendChild(content);
        }

        if (nextActions.length > 0) {
            const actionsTitle = document.createElement('h5');
            actionsTitle.className = 'team-analysis-summary-actions-title';
            actionsTitle.textContent = 'What to do next';
            const actionsList = document.createElement('ul');
            actionsList.className = 'team-analysis-summary-actions';
            nextActions.forEach((line) => {
                const li = document.createElement('li');
                li.textContent = line;
                actionsList.appendChild(li);
            });
            summary.appendChild(actionsTitle);
            summary.appendChild(actionsList);
        }

        body.appendChild(summary);
    }

    requestAnimationFrame(() => {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// Player Interactions
function setupPlayerInteractions() {
    // Limit interactions to the main team display so trade analyzer
    // placeholders use their own click behavior.
    const playerCards = document.querySelectorAll('.team-display .player-card');
    
    playerCards.forEach(card => {
        card.addEventListener('click', function() {
            // Add selection effect
            playerCards.forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            
            // Show player details (placeholder for now)
            const playerName = this.querySelector('h5').textContent;
            showPlayerDetails(playerName);
        });
    });
}

function showPlayerDetails(playerName) {
    // Placeholder for player details modal
    showNotification(`Viewing details for ${playerName}`, 'info');
}

function updateTeamOverallRating() {
    try {
        const overallStat = document.querySelector('.team-stats .stat strong');
        if (!overallStat) return;

        const ratingEls = document.querySelectorAll('.lineup-section .player-card .rating');
        let total = 0;
        let count = 0;
        ratingEls.forEach(el => {
            const val = parseFloat(el.textContent);
            if (!isNaN(val)) {
                total += val;
                count++;
            }
        });

        if (count === 0) {
            overallStat.textContent = '--';
            return;
        }

        const avg = total / count;
        overallStat.textContent = avg.toFixed(1);
    } catch (e) {
        console.error('Failed to update team overall rating:', e);
    }
}

// Utility Functions
function showNotification(message, type = 'info') {
    // Only show popups for warnings and errors
    if (type !== 'warning' && type !== 'error') {
        return;
    }
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add notification styles
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1001;
            animation: slideIn 0.3s ease;
        }
        .notification.success {
            background: #00d4aa;
        }
        .notification.warning {
            background: #ffa502;
        }
        .notification.info {
            background: #4a9eff;
        }
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
            if (document.head.contains(style)) {
                document.head.removeChild(style);
            }
        }, 300);
    }, 3000);
}

// Add fadeIn animation
const fadeInStyle = document.createElement('style');
fadeInStyle.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(fadeInStyle);
