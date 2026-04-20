/**
 * BINGO SYSTEM - ULTRA STABLE VERSION (Netlify Optimized)
 * Safe state management and error handling
 */

const CHANNEL_NAME = 'bingo_channel';
const bc = new BroadcastChannel(CHANNEL_NAME);

const DB_NAME = 'BingoAdsDB';
const STORE_NAME = 'ads';
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };
        request.onerror = (e) => {
            console.error("IndexedDB Critical Error:", e);
            resolve(); // Fail gracefully
        };
    });
}

// Initial State
let state = {
    drawnNumbers: [],
    lastNumber: null,
    mode: 'bingo',
    currentAdIndex: 0,
    autoplayAds: true,
    adsMuted: true,
    color: '#3b82f6',
    cardColorName: '',
    winType: null,
    history: [],
    dynamicAds: []
};

let lastRenderedAdIndex = -1;

// Sound Effects
const sounds = {
    draw: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'),
    win: new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'),
    reset: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3')
};

// Initialize
async function init() {
    console.log("Iniciando Sistema Bingo...");
    try {
        await initDB();
        loadState();
        await loadDynamicAds();
        setupSync();

        renderPresenterGrid();
        renderTelao();
        updateUI();
        console.log("Sistema Pronto!");
    } catch (err) {
        console.error("Erro na inicialização:", err);
    }
}

async function loadDynamicAds() {
    return new Promise((resolve) => {
        if (!db) return resolve();
        try {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                state.dynamicAds = request.result || [];
                resolve();
            };
            request.onerror = () => resolve();
        } catch (e) {
            resolve();
        }
    });
}

function loadState() {
    try {
        const saved = localStorage.getItem('bingo_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Limpa dados pesados acidentais do LocalStorage
            if (parsed.dynamicAds) delete parsed.dynamicAds;
            state = { ...state, ...parsed };
        }
    } catch (e) {
        console.warn("Erro ao carregar localStorage, resetando...");
        localStorage.removeItem('bingo_state');
    }
}

function saveState() {
    try {
        const { dynamicAds, ...toSave } = state;
        localStorage.setItem('bingo_state', JSON.stringify(toSave));
    } catch (e) {
        console.error("Erro ao salvar no localStorage (Quota excedida?)");
    }
}

function setupSync() {
    bc.onmessage = async (event) => {
        try {
            if (event.data.type === 'ad_ended') {
                if (document.getElementById('bingo-grid-presenter')) nextAd();
                return;
            }
            state = { ...state, ...event.data };
            await loadDynamicAds();
            updateUI();
        } catch (e) {
            console.error("Erro na recepção do Sync:", e);
        }
    };
}

function broadcast() {
    try {
        const { dynamicAds, ...toSend } = state;
        // Envia apenas o básico para não travar o canal
        bc.postMessage(JSON.parse(JSON.stringify(toSend)));
        saveState();
    } catch (e) {
        console.error("Erro no Broadcast:", e);
    }
}

// Core Actions
function drawNumber(num, isManual = false) {
    num = parseInt(num);
    if (num < 1 || num > 75 || isNaN(num)) return;

    if (state.drawnNumbers.includes(num)) {
        if (isManual) {
            showAlert(`O número ${num} já saiu!`);
            return;
        }
        state.drawnNumbers = state.drawnNumbers.filter(n => n !== num);
        if (state.lastNumber === num) {
            state.lastNumber = state.drawnNumbers[state.drawnNumbers.length - 1] || null;
        }
    } else {
        if (state.drawnNumbers.length >= 75) return;
        state.drawnNumbers.push(num);
        state.lastNumber = num;
        state.history.push(num);
        sounds.draw.play().catch(() => { });

        if (state.drawnNumbers.length === 75) {
            setTimeout(() => showAlert("🏆 CARTELA COMPLETA!"), 500);
        }
    }

    state.winType = null;
    broadcast();
    updateUI();
}

function resetGame() {
    showConfirm('Resetar o jogo atual?', () => {
        state.drawnNumbers = [];
        state.lastNumber = null;
        state.winType = null;
        state.history = [];
        sounds.reset.play().catch(() => { });
        broadcast();
        updateUI();
    });
}

// EMERGENCY RESET
window.fullSystemReset = function () {
    if (confirm("Isso apagará todas as propagandas e limpará o jogo. Deseja continuar?")) {
        localStorage.clear();
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => location.reload();
        request.onerror = () => location.reload();
    }
}

function setMode(mode) {
    state.mode = mode;
    broadcast();
    updateUI();
}

function triggerWin(type) {
    state.winType = type;
    sounds.win.play().catch(() => { });
    broadcast();
    updateUI();
}

function setCardColor(color) {
    state.color = color;
    broadcast();
    updateUI();
}

function setCardColorName(name) {
    state.cardColorName = name;
    broadcast();
    updateUI();
}

function toggleAdsMute() {
    state.adsMuted = !state.adsMuted;
    broadcast();
    updateUI();
}

function showAlert(msg) {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) { alert(msg); return; }
    document.getElementById('modal-message').textContent = msg;
    const btnContainer = document.getElementById('modal-buttons');
    btnContainer.innerHTML = '<button class="btn btn-primary" onclick="document.getElementById(\'modal-overlay\').style.display=\'none\'">OK</button>';
    overlay.style.display = 'flex';
}

function showConfirm(msg, onConfirm) {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) { if (confirm(msg)) onConfirm(); return; }
    document.getElementById('modal-message').textContent = msg;
    const btnContainer = document.getElementById('modal-buttons');
    btnContainer.innerHTML = '';

    const bC = document.createElement('button'); bC.className = 'btn btn-danger'; bC.textContent = 'Não';
    bC.onclick = () => overlay.style.display = 'none';

    const bS = document.createElement('button'); bS.className = 'btn btn-success'; bS.textContent = 'Sim';
    bS.onclick = () => { overlay.style.display = 'none'; onConfirm(); };

    btnContainer.appendChild(bC);
    btnContainer.appendChild(bS);
    overlay.style.display = 'flex';
}

function renderPresenterGrid() {
    const container = document.getElementById('bingo-grid-presenter');
    if (container) renderGenericGrid(container, true);
}

function renderTelao() {
    const container = document.getElementById('telao-grid');
    if (container) renderGenericGrid(container, false);
}

function renderGenericGrid(container, isInteractive) {
    container.innerHTML = '';
    const letters = ['B', 'I', 'N', 'G', 'O'];
    letters.forEach((letter, idx) => {
        const h = document.createElement('div'); h.className = 'header-cell'; h.textContent = letter;
        container.appendChild(h);
        const start = idx * 15 + 1;
        for (let i = start; i < start + 15; i++) {
            const cell = document.createElement('div');
            cell.className = 'number-cell';
            cell.textContent = i;
            if (isInteractive) cell.onclick = () => drawNumber(i);
            container.appendChild(cell);
        }
    });
}

function updateUI() {
    try {
        document.documentElement.style.setProperty('--card-active', state.color);

        const colorLabel = document.getElementById('current-card-color-label');
        if (colorLabel) {
            colorLabel.textContent = state.cardColorName ? `Cartela: ${state.cardColorName}` : '';
            colorLabel.style.display = state.cardColorName ? 'block' : 'none';
        }

        const allCells = document.querySelectorAll('.number-cell');
        allCells.forEach(cell => {
            const num = parseInt(cell.textContent);
            if (state.drawnNumbers.includes(num)) {
                cell.classList.add('active');
                if (num === state.lastNumber) cell.classList.add('last-drawn');
                else cell.classList.remove('last-drawn');
            } else {
                cell.classList.remove('active', 'last-drawn');
            }
        });

        const lastNumVal = document.getElementById('last-number-value');
        if (lastNumVal) {
            lastNumVal.textContent = state.lastNumber ? `${getLetter(state.lastNumber)} ${state.lastNumber}` : '--';
        }

        // Ads logic
        const adsContainer = document.getElementById('ads-container');
        if (adsContainer) {
            if (state.mode === 'ads') {
                adsContainer.classList.add('active');
                const adContent = document.getElementById('ad-content');
                if (adContent && state.dynamicAds.length > 0) {
                    if (state.currentAdIndex !== lastRenderedAdIndex || adContent.innerHTML === '') {
                        lastRenderedAdIndex = state.currentAdIndex;
                        const ad = state.dynamicAds[state.currentAdIndex];
                        const isPresenter = !!document.getElementById('bingo-grid-presenter');
                        if (ad.type === 'video') {
                            const l = isPresenter ? 'loop' : '';
                            adContent.innerHTML = `<video id="active-video" src="${ad.data}" autoplay ${l} ${state.adsMuted ? 'muted' : ''} style="max-width:100%; max-height:100%;"></video>`;
                            if (!isPresenter) {
                                document.getElementById('active-video').onended = () => bc.postMessage({ type: 'ad_ended' });
                            }
                        } else {
                            adContent.innerHTML = `<img src="${ad.data}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
                        }
                    } else {
                        const v = document.getElementById('active-video');
                        if (v) v.muted = state.adsMuted;
                    }
                } else if (adContent) {
                    adContent.innerHTML = '';
                    lastRenderedAdIndex = -1;
                }
            } else {
                adsContainer.classList.remove('active');
                const adContent = document.getElementById('ad-content');
                if (adContent) adContent.innerHTML = '';
                lastRenderedAdIndex = -1;
            }
        }

        // Ad list manager
        const adList = document.getElementById('dynamic-ad-list');
        if (adList) {
            adList.innerHTML = '';
            state.dynamicAds.forEach(ad => {
                const item = document.createElement('div');
                item.className = 'ad-item';
                item.style = 'display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 5px; border-radius: 8px; margin-bottom: 5px;';
                const thumb = ad.type === 'video' ? '📽️' : `<img src="${ad.data}" style="width: 40px; height: 30px; object-fit: cover; border-radius: 4px;">`;
                item.innerHTML = `
                    <div style="width:40px; text-align:center;">${thumb}</div>
                    <span style="flex: 1; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ad.name}</span>
                    <button onclick="removeAd(${ad.id})" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 1.2rem;">&times;</button>
                `;
                adList.appendChild(item);
            });
        }

        const muteBtn = document.getElementById('mute-ads-btn');
        if (muteBtn) {
            muteBtn.textContent = state.adsMuted ? '🔇 Áudio Desligado' : '🔊 Áudio Ligado';
            muteBtn.className = state.adsMuted ? 'btn btn-danger' : 'btn btn-success';
        }

        const winOverlay = document.getElementById('win-overlay');
        if (winOverlay) {
            if (state.winType) {
                winOverlay.classList.add('active');
                document.getElementById('win-text').textContent = state.winType === 'quina' ? 'QUINA!' : 'BINGO!';
                startConfetti(state.winType === 'bingo' ? 200 : 100);
            } else {
                winOverlay.classList.remove('active');
                stopConfetti();
            }
        }

        const historyList = document.getElementById('history-list');
        if (historyList) {
            historyList.textContent = state.drawnNumbers.slice().reverse().join(', ') || 'Vazio';
        }
    } catch (e) {
        console.error("Erro no updateUI:", e);
    }
}

function getLetter(num) {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    return 'O';
}

async function uploadAd(input) {
    const files = Array.from(input.files);
    for (const file of files) {
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        const reader = new FileReader();
        reader.onload = async (e) => {
            if (!db) return alert("Erro no Banco de Dados. Recarregue.");
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.add({ data: e.target.result, name: file.name, type: type });
            await loadDynamicAds();
            broadcast();
            updateUI();
        };
        reader.readAsDataURL(file);
    }
}

async function removeAd(id) {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    await loadDynamicAds();
    broadcast();
    updateUI();
}

function nextAd() {
    if (state.dynamicAds.length === 0) return;
    state.currentAdIndex = (state.currentAdIndex + 1) % state.dynamicAds.length;
    broadcast();
    updateUI();
}

function prevAd() {
    if (state.dynamicAds.length === 0) return;
    state.currentAdIndex = (state.currentAdIndex - 1 + state.dynamicAds.length) % state.dynamicAds.length;
    broadcast();
    updateUI();
}

function undoLast() {
    if (state.drawnNumbers.length === 0) return;
    const last = state.lastNumber;
    state.drawnNumbers = state.drawnNumbers.filter(n => n !== last);
    state.lastNumber = state.drawnNumbers[state.drawnNumbers.length - 1] || null;
    broadcast();
    updateUI();
}

window.registerManual = function () {
    const input = document.getElementById('manual-num');
    if (input) {
        drawNumber(input.value, true);
        input.value = '';
        input.focus();
    }
};

setInterval(() => {
    const isPresenter = !!document.getElementById('bingo-grid-presenter');
    if (isPresenter && state.mode === 'ads' && state.autoplayAds && state.dynamicAds.length > 0) {
        const currentAd = state.dynamicAds[state.currentAdIndex];
        if (currentAd && currentAd.type === 'video') return;
        state.currentAdIndex = (state.currentAdIndex + 1) % state.dynamicAds.length;
        broadcast();
        updateUI();
    }
}, 10000);

init();