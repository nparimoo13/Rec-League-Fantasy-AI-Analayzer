// Fantasy Football Team & Trade Analyzer JavaScript
// Main application logic and UI interactions

// Initialize API Controller (loaded from external file)
const apiController = new FantasyAPIController();

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application
    initializeApp();
});

function initializeApp() {
    setupLeagueSettings();
    setupTradeAnalyzer();
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
            
            // Check if it's the Sleeper button
            if (this.classList.contains('sleeper')) {
                showSleeperUsernamePopup();
            } else {
                // Show connection modal or API integration for other providers
                showProviderConnection(this.textContent.trim());
            }
        });
    });
    
    // League settings change handlers
    const scoringFormat = document.getElementById('scoringFormat');
    const leagueType = document.getElementById('leagueType');
    const superflex = document.getElementById('superflex');
    
    [scoringFormat, leagueType, superflex].forEach(element => {
        element.addEventListener('change', updateLeagueSettings);
    });
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
            // Re-enable button on error
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<i class="fas fa-link"></i> Connect';
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
    const settings = {
        scoringFormat: document.getElementById('scoringFormat').value,
        leagueType: document.getElementById('leagueType').value,
        superflex: document.getElementById('superflex').checked
    };
    
    console.log('League settings updated:', settings);
    
    // Here you would typically save settings to localStorage or send to server
    localStorage.setItem('leagueSettings', JSON.stringify(settings));
    
    // Show a subtle notification
    showNotification('League settings saved!', 'success');
}

// Trade Analyzer Functionality
function setupTradeAnalyzer() {
    const analyzeBtn = document.querySelector('.analyze-btn');
    if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeTrade);

    // Wire up Add Player buttons for trade analyzer
    const addButtons = document.querySelectorAll('.add-trade-player-btn');
    addButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const side = btn.getAttribute('data-side') || 'giving';
            showGlobalAddPlayerModal({ mode: 'trade', side });
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
            renderTradeSearchResults(matches, side, results, closeModal, () => selectedIndex);
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
            addTradePlayer(side, { name: m.full_name, position: m.position, rating });
        } else {
            if (window.apiController && typeof apiController.addPlayerToLineup === 'function') {
                apiController.addPlayerToLineup(lineupPosition || (m.position || 'FLEX'), {
                    full_name: m.full_name,
                    position: m.position || lineupPosition || 'FLEX',
                    team: m.team || '',
                    id: m.id,
                    image: getEspnHeadshotUrl(m.id)
                });
            }
        }
        closeModal();
    }
}

// ESPN NFL players dataset (cached once)
let _espnPlayersCache = null;
async function loadEspnPlayers() {
    if (_espnPlayersCache) return _espnPlayersCache;
    const url = 'https://sports.core.api.espn.com/v3/sports/football/nfl/athletes?limit=20000&active=true';
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`ESPN players fetch failed: ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    _espnPlayersCache = items.map(it => ({
        id: it.id,
        full_name: it.fullName || it.displayName || it.shortName || '',
        position: (it.position && (it.position.abbreviation || it.position.name)) || '',
        team: (it.team && (it.team.abbreviation || it.team.name)) || ''
    })).filter(p => p.full_name);
    return _espnPlayersCache;
}

async function universalPlayerSearch(query) {
    const q = (query || '').toLowerCase();
    if (!q) return [];
    try {
        const list = await loadEspnPlayers();
        const out = [];
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p.full_name.toLowerCase().includes(q)) {
                out.push(p);
                if (out.length >= 30) break;
            }
        }
        return out;
    } catch (e) {
        console.error('universalPlayerSearch error:', e);
        return [];
    }
}

function getEspnHeadshotUrl(id) {
    // ESPN headshot CDN pattern via s3/img handles; use a proxy-less simple path when available
    // Fallback to Sleeper static if not available
    const espn = `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
    return espn;
}

function renderTradeSearchResults(matches, side, resultsEl, closeModal, getSelectedIndex) {
    if (!Array.isArray(matches)) { resultsEl.innerHTML = ''; return; }
    resultsEl.innerHTML = matches.map(m => {
        const avatar = getEspnHeadshotUrl(m.id);
        return `
            <div class="result-item" data-id="${m.id}" data-name="${m.full_name}" data-pos="${m.position || ''}" data-team="${m.team || ''}">
                <div class="avatar"><img src="${avatar}" alt="${m.full_name}" onerror="this.onerror=null;this.src='https://via.placeholder.com/36x36/1a1a2e/ffffff?text=${(m.position||'').slice(0,2)}';"/></div>
                <div class="meta">
                    <span class="name">${m.full_name}</span>
                    <span class="sub">${m.position || '-'} ${m.team ? ('- ' + m.team) : ''}</span>
                </div>
            </div>
        `;
    }).join('');

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
            const name = item.getAttribute('data-name');
            const position = item.getAttribute('data-pos');
            // Simple placeholder rating; could be replaced with real metric
            const rating = (Math.random() * 15 + 80).toFixed(1);
            addTradePlayer(side, { name, position, rating });
            closeModal();
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
    if (!target) return;

    const el = document.createElement('div');
    el.className = 'trade-player-item';
    el.innerHTML = `
        <div class="player-info">
            <strong>${data.name}</strong>
            <span>${data.position || '-'}</span>
        </div>
        <div class="player-rating">${data.rating}</div>
        <button class="remove-btn">×</button>
    `;

    // Minimal styles if not already present
    const itemStyle = document.createElement('style');
    itemStyle.textContent = `
        .trade-player-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(74,158,255,0.1); border-radius: 6px; margin-bottom: 8px; border: 1px solid rgba(74,158,255,0.2); }
        .trade-player-item .player-info { flex: 1; }
        .trade-player-item .player-info strong { color: #ffffff; display: block; font-size: 0.9rem; }
        .trade-player-item .player-info span { color: #b0b0b0; font-size: 0.8rem; }
        .trade-player-item .player-rating { background: #4a9eff; color: #1a1a2e; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; margin: 0 10px; }
        .remove-btn { background: #ff4757; color: white; border: none; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
        .remove-btn:hover { background: #ff3742; }
        .add-trade-player-modal .result-item.selected { outline: 2px solid #4a9eff; }
    `;
    document.head.appendChild(itemStyle);

    target.appendChild(el);
    el.querySelector('.remove-btn').addEventListener('click', () => { el.remove(); updateTradeAnalysis(); });
    updateTradeAnalysis();
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
        const rating = parseFloat(player.querySelector('.player-rating').textContent);
        givingValue += rating;
    });
    
    receivingPlayers.forEach(player => {
        const rating = parseFloat(player.querySelector('.player-rating').textContent);
        receivingValue += rating;
    });
    
    const tradeValue = receivingValue - givingValue;
    const fairness = Math.abs(tradeValue) < 5 ? 'Fair' : tradeValue > 0 ? 'Favorable' : 'Unfavorable';
    
    document.getElementById('tradeValue').textContent = tradeValue.toFixed(1);
    document.getElementById('fairness').textContent = fairness;
    
    // Update fairness color
    const fairnessElement = document.getElementById('fairness');
    fairnessElement.style.color = fairness === 'Fair' ? '#00d4aa' : 
                                 fairness === 'Favorable' ? '#4a9eff' : '#ff4757';
}

function analyzeTrade() {
    const givingList = document.getElementById('givingList');
    const receivingList = document.getElementById('receivingList');
    
    if (!givingList || !receivingList) {
        showNotification('Please add players to both sides of the trade', 'warning');
        return;
    }
    
    const givingPlayers = givingList.querySelectorAll('.trade-player-item');
    const receivingPlayers = receivingList.querySelectorAll('.trade-player-item');
    
    if (givingPlayers.length === 0 || receivingPlayers.length === 0) {
        showNotification('Please add players to both sides of the trade', 'warning');
        return;
    }
    
    // Perform detailed trade analysis
    const analysis = performTradeAnalysis(givingPlayers, receivingPlayers);
    
    showTradeAnalysisModal(analysis);
}

function performTradeAnalysis(givingPlayers, receivingPlayers) {
    // Simplified analysis - in a real app, this would use advanced algorithms
    let givingValue = 0;
    let receivingValue = 0;
    let givingCount = givingPlayers.length;
    let receivingCount = receivingPlayers.length;
    
    givingPlayers.forEach(player => {
        const rating = parseFloat(player.querySelector('.player-rating').textContent);
        givingValue += rating;
    });
    
    receivingPlayers.forEach(player => {
        const rating = parseFloat(player.querySelector('.player-rating').textContent);
        receivingValue += rating;
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
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Trade Analysis Results</h3>
            <div class="analysis-results">
                <div class="result-item">
                    <span class="label">Net Value:</span>
                    <span class="value ${analysis.netValue > 0 ? 'positive' : 'negative'}">${analysis.netValue > 0 ? '+' : ''}${analysis.netValue}</span>
                </div>
                <div class="result-item">
                    <span class="label">Your Average:</span>
                    <span class="value">${analysis.avgGiving}</span>
                </div>
                <div class="result-item">
                    <span class="label">Their Average:</span>
                    <span class="value">${analysis.avgReceiving}</span>
                </div>
                <div class="result-item">
                    <span class="label">Fairness:</span>
                    <span class="value ${analysis.fairness.toLowerCase()}">${analysis.fairness}</span>
                </div>
            </div>
            <div class="recommendation">
                <h4>Recommendation:</h4>
                <p>${analysis.recommendation}</p>
            </div>
            <button class="close-modal">Close</button>
        </div>
    `;
    
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
            z-index: 1000;
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

// Player Interactions
function setupPlayerInteractions() {
    const playerCards = document.querySelectorAll('.player-card');
    
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
