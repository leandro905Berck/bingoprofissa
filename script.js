/**
 * BINGO SYSTEM - CORE LOGIC
 * Optimized for High Performance & Large Media
 */

const CHANNEL_NAME = 'bingo_channel';
const bc = new BroadcastChannel(CHANNEL_NAME);

// IndexedDB for Image/Video Storage
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
            console.error("Erro IndexedDB:", e);
            reject(e);
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
    dynamicAds: [] // Metadata only during broadcast
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
    try {
        await initDB();
        loadState();
        await loadDynamicAds();
        setupSync();
        
        renderPresenterGrid();
        renderTelao();
        updateUI();
    } catch (err) {
        console.error("Falha na inicialização:", err);
    }
}

async function loadDynamicAds() {
    return new Promise((resolve) => {
        if (!db) return resolve();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            state.dynamicAds = request.result;
            resolve();
        };
        request.onerror = () => resolve();
    });
}

// Load/Save State
function loadState() {
    const saved = localStorage.getItem('bingo_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        // Merge e garante que dynamicAds venha do DB
        state = { ...state, ...parsed };
    }
}

function saveState() {
    // Nunca salva os dados pesados (blobs/base64) no LocalStorage
    const { dynamicAds, ...toSave } = state;
    localStorage.setItem('bingo_state', JSON.stringify(toSave));
}

// Sync
function setupSync() {
    bc.onmessage = async (event) => {
        if (event.data.type === 'ad_ended') {
            if (document.getElementById('bingo-grid-presenter')) nextAd();
            return;
        }

        // Recebe o estado novo
        const newState = event.data;
        
        // Sincroniza o estado básico
        state = { ...state, ...newState };
        
        // Recarrega as mídias do DB local de forma independente
        await loadDynamicAds();
        updateUI();
    };
}

function broadcast() {
    // PERFORMANCE: Removemos os dados pesados antes de enviar pelo canal
    // O Telão vai ler os dados direto do seu próprio IndexedDB
    const { dynamicAds, ...toSend } = state;
    bc.postMessage(toSend);
    saveState();
}

// Core Actions
function drawNumber(num, isManual = false) {
    num = parseInt(num);
    if (num < 1 || num > 75 || isNaN(num)) return;

    if (state.drawnNumbers.includes(num)) {
        if (isManual) {
            showAlert(`Atenção: O número ${num} já foi sorteado anteriormente!`);
            return;
        }
        state.drawnNumbers = state.drawnNumbers.filter(n => n !== num);
        if (state.lastNumber === num) {
            state.lastNumber = state.drawnNumbers[state.drawnNumbers.length - 1] || null;
        }
    } else {
        if (state.drawnNumbers.length >= 75) {
            showAlert("A cartela está completa! Todos os 75 números já foram sorteados.");
            return;
        }
        state.drawnNumbers.push(num);
        state.lastNumber = num;
        state.history.push(num);
        sounds.draw.play().catch(() => {});
        
        if (state.drawnNumbers.length === 75) {
            setTimeout(() => showAlert("🎉 PARABÉNS! Todos os números foram sorteados!"), 500);
        }
    }
    
    state.winType = null;
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

function resetGame() {
    showConfirm('Tem certeza que deseja resetar o jogo? Todos os números sorteados serão perdidos.', () => {
        state.drawnNumbers = [];
        state.lastNumber = null;
        state.winType = null;
        state.history = [];
        sounds.reset.play().catch(() => {});
        broadcast();
        updateUI();
    });
}

function setMode(mode) {
    state.mode = mode;
    broadcast();
    updateUI();
}

function triggerWin(type) {
    state.winType = type;
    sounds.win.play().catch(() => {});
    broadcast();
    updateUI();
    
    setTimeout(() => {
        if (state.winType === type) {
            state.winType = null;
            broadcast();
            updateUI();
        }
    }, 8000);
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

// Custom Modal Helpers
function showAlert(msg) {
    const overlay = document.getElementById('modal-overlay');
    const msgEl = document.getElementById('modal-message');
    const btnContainer = document.getElementById('modal-buttons');
    if (!overlay) { alert(msg); return; }

    msgEl.textContent = msg;
    btnContainer.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'OK';
    btn.onclick = () => overlay.style.display = 'none';
    btnContainer.appendChild(btn);
    overlay.style.display = 'flex';
}

function showConfirm(msg, onConfirm) {
    const overlay = document.getElementById('modal-overlay');
    const msgEl = document.getElementById('modal-message');
    const btnContainer = document.getElementById('modal-buttons');
    if (!overlay) { if(confirm(msg)) onConfirm(); return; }

    msgEl.textContent = msg;
    btnContainer.innerHTML = '';
    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn btn-danger';
    btnCancel.textContent = 'Cancelar';
    btnCancel.onclick = () => overlay.style.display = 'none';
    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'btn btn-success';
    btnConfirm.textContent = 'Confirmar';
    btnConfirm.onclick = () => { overlay.style.display = 'none'; onConfirm(); };
    btnContainer.appendChild(btnCancel);
    btnContainer.appendChild(btnConfirm);
    overlay.style.display = 'flex';
}

// Rendering Logic
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
        container.appendChild(createCell(letter, 'header-cell'));
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

function createCell(text, className) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    return div;
}

function updateUI() {
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

    // Ads View
    const adsContainer = document.getElementById('ads-container');
    if (adsContainer) {
        if (state.mode === 'ads') {
            adsContainer.classList.add('active');
            const adContent = document.getElementById('ad-content');
            if (adContent && state.dynamicAds.length > 0) {
                const ad = state.dynamicAds[state.currentAdIndex];
                const isPresenter = !!document.getElementById('bingo-grid-presenter');
                
                const currentTag = adContent.querySelector('video, img');
                const needsReload = !currentTag || state.currentAdIndex !== lastRenderedAdIndex;

                if (needsReload) {
                    lastRenderedAdIndex = state.currentAdIndex;
                    if (ad.type === 'video') {
                        const loopAttr = isPresenter ? 'loop' : '';
                        adContent.innerHTML = `<video id="active-video" src="${ad.data}" autoplay ${loopAttr} ${state.adsMuted ? 'muted' : ''} style="max-width:100%; max-height:100%;"></video>`;
                        if (!isPresenter) {
                            const videoEl = document.getElementById('active-video');
                            videoEl.onended = () => bc.postMessage({ type: 'ad_ended' });
                        }
                    } else {
                        adContent.innerHTML = `<img src="${ad.data}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
                    }
                } else {
                    const videoEl = document.getElementById('active-video');
                    if (videoEl) videoEl.muted = state.adsMuted;
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

    // Ad Manager UI
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
    const winText = document.getElementById('win-text');
    if (winOverlay && winText && state.winType) {
        winOverlay.classList.add('active');
        winText.textContent = state.winType === 'quina' ? 'QUINA!' : 'BINGO!';
        startConfetti(state.winType === 'bingo' ? 200 : 100);
    } else if (winOverlay) {
        winOverlay.classList.remove('active');
        stopConfetti();
    }

    const historyList = document.getElementById('history-list');
    if (historyList) {
        historyList.textContent = state.drawnNumbers.slice().reverse().join(', ') || 'Nenhum número sorteado';
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

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key.toLowerCase() === 'q') triggerWin('quina');
    if (e.key.toLowerCase() === 'b') triggerWin('bingo');
    if (e.key.toLowerCase() === 'r') resetGame();
    if (e.key.toLowerCase() === 'z' && e.ctrlKey) undoLast();
});

window.registerManual = function() {
    const input = document.getElementById('manual-num');
    if (input) {
        drawNumber(input.value, true);
        input.value = '';
        input.focus();
    }
};

let confettiInterval;
function startConfetti(count) {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            r: Math.random() * 6 + 4,
            d: Math.random() * count,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            tilt: Math.random() * 10 - 10,
            tiltAngleIncremental: Math.random() * 0.07 + 0.05,
            tiltAngle: 0
        });
    }
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.tiltAngle += p.tiltAngleIncremental;
            p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
            p.x += Math.sin(p.d);
            p.tilt = Math.sin(p.tiltAngle) * 15;
            ctx.beginPath(); ctx.lineWidth = p.r; ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
            ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
            ctx.stroke();
            if (p.y > canvas.height) { p.x = Math.random() * canvas.width; p.y = -20; }
        });
    }
    if (confettiInterval) clearInterval(confettiInterval);
    confettiInterval = setInterval(draw, 20);
}

function stopConfetti() {
    clearInterval(confettiInterval);
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

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
