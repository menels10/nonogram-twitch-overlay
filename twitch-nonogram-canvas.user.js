// ==UserScript==
// @name         Twitch Nonogram Grid with canvas
// @namespace    http://tampermonkey.net/
// @version      4.31
// @description  Nonogram overlay + status bars + persistent config
// @author       mrpantera+menels+a lot of chatgpt + kurotaku codes
// @match        https://www.twitch.tv/goki*
// @grant        none
// @run-at       document-start
// @downloadURL  https://menels10.github.io/nonogram-twitch-overlay/twitch-nonogram-canvas.user.js
// ==/UserScript==

(function () {
    'use strict';

    //
    // ─── PERSISTENT UI CONFIG ─────────────────────────────────────────────────────
    //
    let uiConfig = JSON.parse(localStorage.getItem('nonogramUIConfig')) || {
        showMinimizeButtons: false,
        useBlueFill:         false,
        statusEnabled:       false,
        fineTuningEnabled:   false,
        sharpeningEnabled:   false,
        autosendEnabled:     false
    };
    if (typeof uiConfig.sharpeningEnabled !== 'boolean') {
        uiConfig.sharpeningEnabled = false;
    }
    function saveUIConfig() {
        localStorage.setItem('nonogramUIConfig', JSON.stringify(uiConfig));
    }

    //
    // ─── MUTABLE FLAGS (initial values from uiConfig) ─────────────────────────────
    //
    let showMinimizeButtons  = uiConfig.showMinimizeButtons;
    let useBlueFill          = uiConfig.useBlueFill;
    let statusEnabled        = uiConfig.statusEnabled;
    let fineTuningEnabled    = uiConfig.fineTuningEnabled;
    let sharpeningEnabled = uiConfig.sharpeningEnabled;
    let roiCanvas = document.createElement('canvas');
    let roiCtx = roiCanvas.getContext('2d');
    const DEFAULT_CONF = { anchorX: 10, anchorY: 10, zoomFactor: 1.4, fineTune: 0 };
    let size = 4, rowClueCount = 1, colClueCount = 1, ratio = 1.0;
    let anchorX = DEFAULT_CONF.anchorX, anchorY = DEFAULT_CONF.anchorY;
    let zoomFactor = DEFAULT_CONF.zoomFactor, fineTune = DEFAULT_CONF.fineTune;
    let roiWidthPercent = 0.36, roiHeightPercent = 0.584;
    let configs = JSON.parse(localStorage.getItem('nonogramConfigMap')) || {};
    let autosendEnabled = uiConfig.autosendEnabled ?? false;
    let canvas, ctx, frame;
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
    let lastExported = new Set(), lastExportedWhite = new Set(), cellStates = [];
    let hoveredRow = -1, hoveredCol = -1;
    let isMarking = false, markValue = 0, eraseMode = false;
    let isMinimized = false, renderHandle = null;
    let minimizeBtn;
    let moveHistory = [], currentAction = null;
    // ===== Autosend cooldown/queue =====
    const COOLDOWN_MS = 10_000;
    let nextSendAt = 0;            // timestamp when next send is allowed
    let sendQueue = [];            // queued chat messages
    let sendLoopTimer = null;      // setInterval handle
    let progressTimer = null;      // setInterval handle for UI progress
    let exportFillBtn = null;      // set in createMainButtons()
    let exportEmptyBtn = null;     // set in createMainButtons()
    // Clue dashes (left/top bands)
    let rowDashes = [];   // array per row -> [canvasX,...]
    let colDashes = [];   // array per col -> [posWithinTopClueArea,...]
    // ---- Redemption Tracking ----
    let redeemBtn;
    let guard_Export = true; // toggleable in config panel

const REDEEM_KEY = "lastRedeemTimestamp";
function setLastRedeem() {
    localStorage.setItem(REDEEM_KEY, Date.now().toString());
}
function getLastRedeem() {
    return parseInt(localStorage.getItem(REDEEM_KEY) || "0", 10);
}
function minutesSinceRedeem() {
    return (Date.now() - getLastRedeem()) / 60000;
}

// Wrap attemptRedeemCycle to record timestamp
async function redeemAndTrack() {
    console.log("[Reward Redeemer] Redeeming reward...");
    await attemptRedeemCycle();
    lastRedeemTime = Date.now();
    updateCouponButtonColor();
    scheduleAutoRedeem(); // reset the timer after *any* redeem
}
// ---- Auto-Redeem Scheduler ----
let autoRedeemEnabled = false; // test if redemption is working
let autoRedeemTimer = null;   // store active timer
function scheduleAutoRedeem() {
    if (!autoRedeemEnabled) return;

    // Clear any existing timer before making a new one
    if (autoRedeemTimer) {
        clearTimeout(autoRedeemTimer);
        autoRedeemTimer = null;
    }

    const delay = (40 + Math.random() * 15) * 60000; // 40–55 minutes
    console.log(`[Reward Redeemer] Next auto redeem in ${(delay/60000).toFixed(1)} min`);

    autoRedeemTimer = setTimeout(async () => {
        await redeemAndTrack();
        scheduleAutoRedeem(); // re-schedule after redemption
    }, delay);
}
scheduleAutoRedeem();
function createRedeemButton() {
    redeemBtn = document.createElement('button');
    redeemBtn.textContent = '🎟️ Redeem Reward';
    redeemBtn.style.position = 'fixed';
    redeemBtn.style.bottom = '20px';
    redeemBtn.style.right = '20px';
    redeemBtn.style.zIndex = '9999';
    redeemBtn.style.padding = '10px 15px';
    redeemBtn.style.background = '#9146FF';
    redeemBtn.style.color = 'white';
    redeemBtn.style.border = 'none';
    redeemBtn.style.borderRadius = '6px';
    redeemBtn.style.fontWeight = 'bold';
    redeemBtn.style.cursor = 'pointer';
    redeemBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';

    redeemBtn.addEventListener('click', () => {
        console.log('[Reward Redeemer] Manual redeem triggered.');
        redeemAndTrack();
    });

    document.body.appendChild(redeemBtn);

    // start monitoring after button is created
    startRedeemButtonMonitor();
}

// update button color based on time since last redeem
function startRedeemButtonMonitor() {
    setInterval(() => {
        if (!redeemBtn) return;

        const mins = minutesSinceRedeem();

        if (mins > 45) {
            // long overdue
            redeemBtn.style.background = '#b22222'; // dark red
        } else if (mins > 30) {
            // warning zone
            redeemBtn.style.background = '#ff4444'; // bright red
        } else {
            // normal
            redeemBtn.style.background = '#9146FF'; // twitch purple
        }
    }, 60000); // check every 60s
}
// ---- Export Hook ----
async function guardedExport(fn, ...args) {
    if (!guard_Export) {
        // Guard disabled → just run immediately
        return fn(...args);
    }

    if (minutesSinceRedeem() > 55) {
        console.log("[Reward Redeemer] Coupon expired, redeeming new one...");
        await redeemAndTrack();
        const waitMs = (8 + Math.random() * 7) * 1000;
        console.log(`[Reward Redeemer] Waiting ${(waitMs/1000).toFixed(1)}s before export...`);
        await new Promise(r => setTimeout(r, waitMs));
    }
    return fn(...args);
}
    // ─── STATUS BAR REGIONS (for 1920×1080) ──────────────────────────────────────
    const statusRegions = [
        { sx: 200, sy: 980, sw: 250, sh: 70 },
        { sx: 500, sy: 980, sw: 250, sh: 70 },
        { sx: 800, sy: 980, sw: 250, sh: 70 }
    ];
    let statusCanvases = [];

    const sizeLookup = {
        "4_1": { cellSize: 90.7, anchorX: 3, anchorY: 7 },
        "4_2": { cellSize: 85.3, anchorX: 3, anchorY: 7 },
        "5_1": { cellSize: 73.3, anchorX: 3, anchorY: 7 },
        "5_2": { cellSize: 69.3, anchorX: 3, anchorY: 7 },
        "5_3": { cellSize: 65.3, anchorX: 3, anchorY: 7 },
        "6_1": { cellSize: 61.3, anchorX: 3, anchorY: 7 },
        "6_2": { cellSize: 57.3, anchorX: 3, anchorY: 7 },
        "6_3": { cellSize: 54.6, anchorX: 3, anchorY: 7 },
        "7_1": { cellSize: 51.9, anchorX: 3, anchorY: 7 },
        "7_2": { cellSize: 49.5, anchorX: 3, anchorY: 7 },
        "7_3": { cellSize: 46.7, anchorX: 3, anchorY: 7 },
        "7_4": { cellSize: 44.1, anchorX: 3, anchorY: 7 },
        "8_1": { cellSize: 45.3, anchorX: 3, anchorY: 7 },
        "8_2": { cellSize: 42.7, anchorX: 3, anchorY: 7 },
        "8_3": { cellSize: 41.3, anchorX: 3, anchorY: 7 },
        "8_4": { cellSize: 38.7, anchorX: 3, anchorY: 7 },
        "9_1": { cellSize: 40, anchorX: 3, anchorY: 7 },
        "9_2": { cellSize: 38.7, anchorX: 3, anchorY: 7 },
        "9_3": { cellSize: 37.3, anchorX: 3, anchorY: 7 },
        "9_4": { cellSize: 34.7, anchorX: 3, anchorY: 7 },
        "9_5": { cellSize: 33.3, anchorX: 3, anchorY: 7 },
        "10_1": { cellSize: 36, anchorX: 3, anchorY: 7 },
        "10_2": { cellSize: 34.7, anchorX: 3, anchorY: 7 },
        "10_3": { cellSize: 33.3, anchorX: 3, anchorY: 7 },
        "10_4": { cellSize: 30.7, anchorX: 3, anchorY: 7 },
        "10_5": { cellSize: 29.3, anchorX: 3, anchorY: 7 },
        "11_1": { cellSize: 33.3, anchorX: 3, anchorY: 7 },
        "11_2": { cellSize: 32, anchorX: 3, anchorY: 7 },
        "11_3": { cellSize: 30.7, anchorX: 3, anchorY: 7 },
        "11_4": { cellSize: 29.4, anchorX: 3.75, anchorY: 7 },
        "11_5": { cellSize: 28, anchorX: 3.75, anchorY: 7 },
        "11_6": { cellSize: 26.7, anchorX: 3.75, anchorY: 7 },
        "12_1": { cellSize: 30.7, anchorX: 3, anchorY: 7 },
        "12_2": { cellSize: 29.3, anchorX: 3, anchorY: 7 },
        "12_3": { cellSize: 28, anchorX: 3, anchorY: 7 },
        "12_4": { cellSize: 26.7, anchorX: 3.75, anchorY: 7 },
        "12_5": { cellSize: 25.3, anchorX: 3.75, anchorY: 7 },
        "12_6": { cellSize: 24.1, anchorX: 3.75, anchorY: 7 },
        "13_1": { cellSize: 28, anchorX: 3, anchorY: 7 },
        "13_2": { cellSize: 26.7, anchorX: 3, anchorY: 7 },
        "13_3": { cellSize: 25.4, anchorX: 3, anchorY: 7 },
        "13_4": { cellSize: 25.4, anchorX: 3.5, anchorY: 7 },
        "13_5": { cellSize: 24, anchorX: 3.5, anchorY: 7 },
        "13_6": { cellSize: 22.7, anchorX: 3.5, anchorY: 7 },
        "13_7": { cellSize: 21.4, anchorX: 3, anchorY: 7 },
        "14_1": { cellSize: 26.7, anchorX: 3, anchorY: 7 },
        "14_2": { cellSize: 25.3, anchorX: 3.5, anchorY: 7 },
        "14_3": { cellSize: 24, anchorX: 3, anchorY: 7 },
        "14_4": { cellSize: 22.7, anchorX: 3, anchorY: 7 },
        "14_5": { cellSize: 21.3, anchorX: 3, anchorY: 7 },
        "14_6": { cellSize: 21.4, anchorX: 3.5, anchorY: 7 },
        "14_7": { cellSize: 20, anchorX: 3, anchorY: 7 },
        "15_1": { cellSize: 24, anchorX: 3, anchorY: 7 },
        "15_2": { cellSize: 24, anchorX: 3.5, anchorY: 7 },
        "15_3": { cellSize: 22.7, anchorX: 3, anchorY: 7 },
        "15_4": { cellSize: 21.3, anchorX: 4, anchorY: 7 },
        "15_5": { cellSize: 21.3, anchorX: 3.5, anchorY: 7 },
        "15_6": { cellSize: 20, anchorX: 3.5, anchorY: 7 },
        "15_7": { cellSize: 18.7, anchorX: 3.5, anchorY: 7 },
        "15_8": { cellSize: 18.7, anchorX: 3.5, anchorY: 7 },
        "16_1": { cellSize: 22.6, anchorX: 3, anchorY: 7 },
        "16_2": { cellSize: 22.7, anchorX: 3, anchorY: 7 },
        "16_3": { cellSize: 21.3, anchorX: 3.25, anchorY: 7 },
        "16_4": { cellSize: 20, anchorX: 3.5, anchorY: 7 },
        "16_5": { cellSize: 20, anchorX: 3.5, anchorY: 7 },
        "16_6": { cellSize: 18.7, anchorX: 3.5, anchorY: 7 },
        "16_7": { cellSize: 17.3, anchorX: 3.5, anchorY: 7 },
        "16_8": { cellSize: 17.4, anchorX: 3.5, anchorY: 7 },
        "17_1": { cellSize: 21.3, anchorX: 3, anchorY: 7 },
        "17_2": { cellSize: 21.4, anchorX: 3, anchorY: 7 },
        "17_3": { cellSize: 20, anchorX: 3, anchorY: 7 },
        "17_4": { cellSize: 18.7, anchorX: 3, anchorY: 7 },
        "17_5": { cellSize: 18.7, anchorX: 3, anchorY: 7 },
        "17_6": { cellSize: 17.3, anchorX: 3.75, anchorY: 7 },
        "17_7": { cellSize: 17.3, anchorX: 3.5, anchorY: 7 },
        "17_8": { cellSize: 16, anchorX: 3.5, anchorY: 7 },
        "17_9": { cellSize: 14.7, anchorX: 3.5, anchorY: 7 },
        "18_1": { cellSize: 20, anchorX: 3, anchorY: 7 },
        "18_2": { cellSize: 20, anchorX: 3.5, anchorY: 7 },
        "18_3": { cellSize: 18.7, anchorX: 3.5, anchorY: 7 },
        "18_4": { cellSize: 18.7, anchorX: 3.5, anchorY: 7 },
        "18_5": { cellSize: 17.3, anchorX: 3.5, anchorY: 7.5 },
        "18_6": { cellSize: 16, anchorX: 3.5, anchorY: 7.5 },
        "18_7": { cellSize: 16, anchorX: 3.5, anchorY: 7.5 },
        "18_8": { cellSize: 14.7, anchorX: 3.5, anchorY: 7.5 },
        "18_9": { cellSize: 14.6, anchorX: 3.5, anchorY: 7.5 },
        "19_1": { cellSize: 18.6, anchorX: 3.5, anchorY: 7.5 },
        "19_2": { cellSize: 18.6, anchorX: 4, anchorY: 7.5 },
        "19_3": { cellSize: 17.3, anchorX: 3.5, anchorY: 7.5 },
        "19_4": { cellSize: 17.3, anchorX: 3.5, anchorY: 7.5 },
        "19_5": { cellSize: 16, anchorX: 3.5, anchorY: 7.5 },
        "19_6": { cellSize: 16, anchorX: 3.5, anchorY: 7.5 },
        "19_7": { cellSize: 14.6, anchorX: 3.5, anchorY: 7.5 },
        "19_8": { cellSize: 14.7, anchorX: 3.5, anchorY: 7.5 },
        "19_9": { cellSize: 13.3, anchorX: 3.5, anchorY: 7.5 },
        "19_10": { cellSize: 13.3, anchorX: 3.5, anchorY: 7.5 },
        "20_1": { cellSize: 18.7, anchorX: 3.5, anchorY: 7 },
        "20_2": { cellSize: 17.3, anchorX: 3.5, anchorY: 7 },
        "20_3": { cellSize: 17.3, anchorX: 3.5, anchorY: 7 },
        "20_4": { cellSize: 16, anchorX: 3.5, anchorY: 7 },
        "20_5": { cellSize: 16, anchorX: 3.5, anchorY: 7 },
        "20_6": { cellSize: 14.65, anchorX: 3.5, anchorY: 7 },
        "20_7": { cellSize: 14.6, anchorX: 3.5, anchorY: 7 },
        "20_8": { cellSize: 13.3, anchorX: 3.75, anchorY: 7 },
        "20_9": { cellSize: 13.3, anchorX: 3.5, anchorY: 7 },
        "20_10": { cellSize: 12, anchorX: 3.5, anchorY: 7 },
    };
// === Twitch Reward Redeemer Core Functions ===

const TARGET_REWARD_NAME = "Activity Coupon"; // change to your reward name
const PANEL_WAIT_TIMEOUT = 800;
const CONFIRM_POLL_INTERVAL = 300;
const CONFIRM_MAX_ATTEMPTS = 30;

function findPanelButton() {
    return document.querySelector('button[aria-label="Bits and Points Balances"]') ||
           document.querySelector('[data-test-selector="community-points-summary"] button') ||
           document.querySelector('button[data-test-selector="community-points-summary-button"]');
}

function openPanel() {
    const btn = findPanelButton();
    if (!btn) return false;
    btn.click();
    return true;
}

function waitForAnySelector(selectors, timeout = 3000) {
    const start = Date.now();
    return new Promise(resolve => {
        const tick = () => {
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return resolve(el);
            }
            if (Date.now() - start >= timeout) return resolve(null);
            setTimeout(tick, 50);
        };
        tick();
    });
}

function clickFirstLayerInPanel() {
    const rewardItems = Array.from(document.querySelectorAll('.reward-list-item, .goosYB.reward-list-item, .bitsRewardListItem--yx4rk'));
    if (!rewardItems.length) return false;

    for (const item of rewardItems) {
        const titleEl =
            item.querySelector('div.ipRTld > p') ||
            item.querySelector('p[title]') ||
            item.querySelector('.CoreText-sc-1txzju1-0') ||
            item.querySelector('p');

        const title = titleEl ? titleEl.innerText.trim() : item.innerText.trim();
        if (!title) continue;

        if (title.includes(TARGET_REWARD_NAME)) {
            const btn = item.querySelector('button') || item.querySelector('button.tw-interactable');
            if (!btn || btn.disabled) return false;
            btn.click();
            return true;
        }
    }
    return false;
}

function pollAndClickConfirm() {
    return new Promise(resolve => {
        let attempts = 0;
        const poll = setInterval(() => {
            attempts++;
            const confirmButton = document.querySelector('button:has(p[data-test-selector="RewardText"])');

            if (confirmButton) {
                const ariaAncestor = confirmButton.closest('[aria-hidden]');
                if (!ariaAncestor || ariaAncestor.getAttribute('aria-hidden') !== 'true') {
                    try { confirmButton.click(); } catch (e) {}
                    clearInterval(poll);
                    resolve();
                    return;
                }
            }

            if (attempts >= CONFIRM_MAX_ATTEMPTS) {
                clearInterval(poll);
                resolve();
            }
        }, CONFIRM_POLL_INTERVAL);
    });
}

let busy = false;
async function attemptRedeemCycle() {
    if (busy) return;
    busy = true;

    const opened = openPanel();
    if (!opened) { busy = false; return; }

    const rewardPanel = await waitForAnySelector(
        ['#channel-points-reward-center-body', '.rewards-list', '.reward-list-item'],
        PANEL_WAIT_TIMEOUT
    );

    if (!rewardPanel) { busy = false; return; }

    const firstClicked = clickFirstLayerInPanel();

    if (firstClicked) {
        await new Promise(resolve => setTimeout(resolve, 400));
        await pollAndClickConfirm();
    }

    busy = false;
}
    function getKey(sz, rc, cc) {
        return `${sz}x${rc}x${cc}`;
    }
    function getLayoutSettings(size, colClueLength) {
        const key = `${size}_${colClueLength}`;
        const entry = sizeLookup[key];
        if (!entry) {
            console.warn(`No layout settings found for size=${size}, colClueLength=${colClueLength}`);
            return null;
        }
        return {
            cellSize: entry.cellSize,
            anchorX: entry.anchorX,
            anchorY: entry.anchorY,
        };
    }
    function saveLayout() {
        const key = getKey(size, rowClueCount, colClueCount);
        configs[key] = { ratio, anchorX, anchorY, fineTune, size, rowClueCount, colClueCount };
        localStorage.setItem('nonogramConfigMap', JSON.stringify(configs));
    }
    function loadLayout() {
        const layout = getLayoutSettings(size, colClueCount);
        if (layout) {
            anchorX = layout.anchorX;
            anchorY = layout.anchorY;
        }
        const key = getKey(size, rowClueCount, colClueCount);
        const saved = configs[key];
        if (saved) {
            fineTune = saved.fineTune ?? fineTune;
        }
    }
    function initCells() {
        cellStates = Array.from({ length: size }, () => Array(size).fill(0));
        lastExported = new Set();
        lastExportedWhite = new Set();
        resetClueDashes();
    }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// --- Column dashes (top clue area), pos is vertical offset within [0..clueH]
function addColDash(col, pos, clueH) {
  if (col < 0 || col >= size) return;
  if (!Array.isArray(colDashes[col])) colDashes[col] = [];
  colDashes[col].push(clamp(pos, 0, clueH));
}
function removeNearestColDash(col, pos, threshold = 10) {
  const arr = colDashes[col]; if (!arr || !arr.length) return;
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - pos);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  if (best !== -1 && bestDist <= threshold) arr.splice(best, 1);
}

// --- Row dashes (left clue area), store absolute canvas X for precise draw
function addRowDash(row, canvasX) {
  if (row < 0 || row >= size) return;
  if (!Array.isArray(rowDashes[row])) rowDashes[row] = [];
  rowDashes[row].push(canvasX);
}
function removeNearestRowDash(row, canvasX, threshold = 10) {
  const arr = rowDashes[row]; if (!arr || !arr.length) return;
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - canvasX);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  if (best !== -1 && bestDist <= threshold) arr.splice(best, 1);
}
function computeGridGeometry() {
  // clue area sizing (you already use same logic in createGrid)
  ctx.font = `bold 30px Arial`;
  const clueW = ctx.measureText('0'.repeat(rowClueCount)).width;
  const clueH = 30 * colClueCount + 5;

  const layout = getLayoutSettings(size, colClueCount);
  let cellSize;
  if (layout) {
    const defaultCellSize = layout.cellSize;
    cellSize = (defaultCellSize * size + fineTune) / size;
  } else {
    const gridSize = Math.min(canvas.width - clueW, canvas.height - clueH);
    cellSize = (gridSize + fineTune) / size;
  }

  const ox = canvas.width - cellSize * size - anchorX; // left edge of grid
  const oy = canvas.height - cellSize * size - anchorY; // top edge of grid

  return { clueW, clueH, cellSize, ox, oy };
}
// Reset dash arrays whenever grid changes size
function resetClueDashes() {
  rowDashes = Array.from({ length: size }, () => []);
  colDashes = Array.from({ length: size }, () => []);
}
    // ─── “Clean All” (wipes grid + copies clear command) ─────────────────────────
    function cleanAll() {
        initCells();
        createGrid();
        exportClearCommand();
    }

    function exportCells() {
        const coords = [];
        cellStates.forEach((row, r) => {
            row.forEach((s, c) => {
                if (s === 1) {
                    const coord = `${String.fromCharCode(97 + c)}${r + 1}`;
                    if (!lastExported.has(coord)) {
                        coords.push(coord);
                        lastExported.add(coord);
                    }
                }
            });
        });
        if (coords.length) {
            const msg = `!fill ${coords.join(' ')}`;
            navigator.clipboard.writeText(msg);
            if (autosendEnabled) scheduleSend(msg);
        }
    }

    // ─── “Export All Black” (ignores lastExported, grabs every filled cell) ─────
    function exportAllCells(mode) {
        // Always reset both trackers
        lastExported.clear();
        lastExportedWhite.clear();

        // If no mode provided, behave as a pure reset (no export)
        if (!mode) return;

        const coords = [];

        if (mode === 'black') {
            cellStates.forEach((row, r) => {
                row.forEach((s, c) => {
                    if (s === 1) {
                        const coord = `${String.fromCharCode(97 + c)}${r + 1}`;
                        coords.push(coord);
                        lastExported.add(coord);
                    }
                });
            });
            if (coords.length) {
                const msg = `!fill ${coords.join(' ')}`;
                navigator.clipboard.writeText(msg);
                if (autosendEnabled) scheduleSend(msg);
            }
        } else if (mode === 'white') {
            cellStates.forEach((row, r) => {
                row.forEach((s, c) => {
                    if (s === 2) {
                        const coord = `${String.fromCharCode(97 + c)}${r + 1}`;
                        coords.push(coord);
                        lastExportedWhite.add(coord);
                    }
                });
            });
            if (coords.length) {
                const msg = `!empty ${coords.join(' ')}`;
                navigator.clipboard.writeText(msg);
                if (autosendEnabled) scheduleSend(msg);
            }
        }
    }

    function exportWhiteCells() {
        const coords = [];
        cellStates.forEach((row, r) => {
            row.forEach((s, c) => {
                if (s === 2) {
                    const coord = `${String.fromCharCode(97 + c)}${r + 1}`;
                    if (!lastExportedWhite.has(coord)) {
                        coords.push(coord);
                        lastExportedWhite.add(coord);
                    }
                }
            });
        });
        if (coords.length) {
            const msg = `!empty ${coords.join(' ')}`;
            navigator.clipboard.writeText(msg);
            if (autosendEnabled) scheduleSend(msg);
        }

    }
    function exportClearCommand() {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        const ranges = [];
        for (let c = 0; c < size; c++) {
            const col = letters[c];
            const start = `${col}1`;
            const end = `${col}${size}`;
            ranges.push(`${start}-${end}`);
        }
        const clearCmd = `!clear ${ranges.join(',')}`;
        try {
            navigator.clipboard.writeText(clearCmd);
        } catch (e) {
            console.warn("Clipboard write failed:", e);
            alert(clearCmd);
        }
    }
    function scheduleSend(msg) {
  // queue and kick the loop
  sendQueue.push(msg);
  ensureSendLoop();
  ensureProgressLoop();
}
// ─── Save Originals ─────────────────────────────
const _exportAllCells = exportAllCells;
const _exportWhiteCells = exportWhiteCells;
const _exportCells = exportCells;
const _cleanAll = cleanAll;

// ─── Replace With Guarded Versions ──────────────
exportAllCells = function(mode) {
    return guardedExport(_exportAllCells, mode);
};
exportWhiteCells = function() {
    return guardedExport(_exportWhiteCells);
};
exportCells = function() {
    return guardedExport(_exportCells);
};
cleanAll = function() {
    return guardedExport(_cleanAll);
};
// ========================
// Twitch React Chat (no OAuth required)
// ========================
let current_chat;

function send_message_with_event(message) {
  if (!current_chat || !current_chat.props?.onSendMessage)
    current_chat = get_current_chat();

  if (current_chat?.props?.onSendMessage)
    current_chat.props.onSendMessage(message);
  else
    console.error("Chat not available or missing onSendMessage. (Are you on a chat page and logged in?)");
}

function get_current_chat() {
  try {
    const chat_node = document.querySelector(`section[data-test-selector="chat-room-component-layout"]`);
    if (!chat_node) return null;

    const react_instance = get_react_instance(chat_node);
    if (!react_instance) return null;

    const chat_component = search_react_parents(react_instance, (node) =>
      node.stateNode && node.stateNode.props && node.stateNode.props.onSendMessage
    );

    return chat_component ? chat_component.stateNode : null;
  } catch (e) {
    console.error("Error accessing chat:", e);
    return null;
  }
}

function get_react_instance(el) {
  for (const k in el)
    if (k.startsWith("__reactInternalInstance$") || k.startsWith("__reactFiber$"))
      return el[k];
  return null;
}
function search_react_parents(node, predicate, max_depth = 15, depth = 0) {
  if (!node || depth > max_depth) return null;
  try { if (predicate(node)) return node; } catch {}
  return search_react_parents(node.return, predicate, max_depth, depth + 1);
}
function ensureSendLoop() {
  if (sendLoopTimer) return;
  sendLoopTimer = setInterval(() => {
    const now = Date.now();
    if (sendQueue.length > 0 && now >= nextSendAt) {
      const next = sendQueue.shift();
      try { send_message_with_event(next); } catch (e) { console.error(e); }
      nextSendAt = now + COOLDOWN_MS;
    }
    // stop if nothing to do and cooldown expired
    if (sendQueue.length === 0 && now >= nextSendAt) {
      clearInterval(sendLoopTimer);
      sendLoopTimer = null;
    }
  }, 250);
}

function ensureProgressLoop() {
  if (progressTimer) return;
  progressTimer = setInterval(updateCooldownUI, 100);
}

function stopProgressLoop() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  // clear button visuals
  setBtnProgress(exportFillBtn, null);
  setBtnProgress(exportEmptyBtn, null);
}

function cooldownProgress01() {
  const now = Date.now();
  // When cooling down: 0 -> 1 over 10s. When ready: 1.
  if (now < nextSendAt) return 1 - (nextSendAt - now) / COOLDOWN_MS;
  // If messages are pending, keep bar full
  if (sendQueue.length > 0) return 1;
  return 1;
}

function updateCooldownUI() {
  // Only show when autosend is enabled and we have buttons
  if (!autosendEnabled || (!exportFillBtn && !exportEmptyBtn)) return;
  const p = cooldownProgress01();
  // Disable while cooling down or while a queue exists
    const ready = (Date.now() >= nextSendAt) && (sendQueue.length === 0);
    [exportFillBtn, exportEmptyBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = !ready;
        btn.style.opacity = ready ? '1' : '0.7';
        btn.style.cursor  = ready ? 'pointer' : 'not-allowed';
    });
  setBtnProgress(exportFillBtn, p);
  setBtnProgress(exportEmptyBtn, p);

  // Tooltip with time left
  const now = Date.now();
  const remain = Math.max(0, nextSendAt - now);
  const seconds = Math.ceil(remain / 1000);
  const title = remain > 0 ? `Cooldown: ${seconds}s` : (sendQueue.length ? `Queued: ${sendQueue.length}` : `Ready`);
  if (exportFillBtn)  exportFillBtn.title  = title;
  if (exportEmptyBtn) exportEmptyBtn.title = title;

  // If autosend is off or nothing pending and cooldown done, we can stop loop
  if (!autosendEnabled || (sendQueue.length === 0 && now >= nextSendAt)) {
    stopProgressLoop();
  }
}

// Paint a subtle progress fill behind the button label
function setBtnProgress(btn, p) {
  if (!btn) return;
  if (p == null) {
    btn.style.backgroundImage = '';
    return;
  }
  const pct = Math.max(0, Math.min(1, p)) * 100;
  // gradient fill from left → right; keeps your normal button color visible
  btn.style.backgroundImage =
    `linear-gradient(to right, rgba(0,200,0,0.35) ${pct}%, transparent ${pct}%)`;
}
    function disableShrinks() {
        // Placeholder
    }

function createGrid() {
  const { clueW, clueH, cellSize, ox, oy } = computeGridGeometry();

  ctx.strokeStyle = 'cyan';
  ctx.lineWidth = 1;

  // ── Extended hover (row over left clues; column over top clues) ───────────
  if ((hoveredRow >= 0 && hoveredRow < size) || (hoveredCol >= 0 && hoveredCol < size)) {
    ctx.fillStyle = 'rgba(100, 150, 255, 0.25)';

    if (hoveredRow >= 0) {
      const y = oy + hoveredRow * cellSize;
      // highlight entire row in grid
      ctx.fillRect(ox, y, cellSize * size, cellSize);
      // extend to left clue area
      if (ox > 0) ctx.fillRect(0, y, ox, cellSize);
    }

    if (hoveredCol >= 0) {
      const x = ox + hoveredCol * cellSize;
      // highlight entire column in grid
      ctx.fillRect(x, oy, cellSize, cellSize * size);
      // extend through top clue band
      ctx.fillRect(x, oy - clueH, cellSize, clueH);
    }
  }

  // ── Draw free-placed clue dashes ──────────────────────────────────────────
  const dashH = 3;

  // Top (column dashes). Each dash is centered at column center; vertical pos in [0..clueH]
  {
    const dashW = (1 * cellSize) / 3;
    ctx.fillStyle = '#ffeb3b';
    for (let c = 0; c < size; c++) {
      const colX = ox + c * cellSize + cellSize / 2;
      const baseY = oy - clueH; // top of top-clue area
      const list = colDashes[c] || [];
      for (const pos of list) {
        const y = clamp(baseY + pos - dashH / 2, baseY, oy - dashH);
        ctx.fillRect(colX - dashW / 2, y, dashW, dashH);
      }
    }
  }

  // Left (row dashes). Each dash is centered vertically in the row; X is absolute canvas X
  {
    const dashW = cellSize / 4;
    ctx.fillStyle = '#ffeb3b';
    for (let r = 0; r < size; r++) {
      const rowTop = oy + r * cellSize;
      const list = rowDashes[r] || [];
      for (const canvasX of list) {
        const xDraw = Math.max(0, Math.min(canvasX, ox)); // keep inside left area
        const yDash = rowTop + (cellSize - dashH) / 2;
        ctx.fillRect(xDraw - dashW / 2, yDash, dashW, dashH);
      }
    }
  }

  // ── Grid cells ────────────────────────────────────────────────────────────
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const x = ox + c * cellSize;
      const y = oy + r * cellSize;

      if (cellStates[r][c] === 1) {
        ctx.fillStyle = useBlueFill ? 'rgba(50, 50, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
      } else if (cellStates[r][c] === 2) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      }

      ctx.strokeRect(x, y, cellSize, cellSize);
      if (cellStates[r][c] === 1 || cellStates[r][c] === 2) {
        ctx.fillRect(x, y, cellSize, cellSize);
        if (cellStates[r][c] === 2) ctx.fillStyle = 'black';
      }
    }
  }
}

    function sharpen(ctx, w, h, mix) {
        var x, sx, sy, r, g, b, a, dstOff, srcOff, wt, cx, cy, scy, scx,
            weights = [0, -1, 0, -1, 5, -1, 0, -1, 0],
            katet = Math.round(Math.sqrt(weights.length)),
            half = (katet * 0.5) | 0,
            dstData = ctx.createImageData(w, h),
            dstBuff = dstData.data,
            srcBuff = ctx.getImageData(0, 0, w, h).data,
            y = h;

        while (y--) {
            x = w;
            while (x--) {
                sy = y;
                sx = x;
                dstOff = (y * w + x) * 4;
                r = g = b = a = 0;

                for (cy = 0; cy < katet; cy++) {
                    for (cx = 0; cx < katet; cx++) {
                        scy = sy + cy - half;
                        scx = sx + cx - half;

                        if (scy >= 0 && scy < h && scx >= 0 && scx < w) {
                            srcOff = (scy * w + scx) * 4;
                            wt = weights[cy * katet + cx];
                            r += srcBuff[srcOff]     * wt;
                            g += srcBuff[srcOff + 1] * wt;
                            b += srcBuff[srcOff + 2] * wt;
                            a += srcBuff[srcOff + 3] * wt;
                        }
                    }
                }

                dstBuff[dstOff]     = r * mix + srcBuff[dstOff]     * (1 - mix);
                dstBuff[dstOff + 1] = g * mix + srcBuff[dstOff + 1] * (1 - mix);
                dstBuff[dstOff + 2] = b * mix + srcBuff[dstOff + 2] * (1 - mix);
                dstBuff[dstOff + 3] = srcBuff[dstOff + 3]; // keep alpha
            }
        }

        ctx.putImageData(dstData, 0, 0);
    }
    function updateROI() {
        const video = [...document.querySelectorAll('video')].reverse().find(v => v.readyState >= 2);
        if (!video) return;

        roiCtx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);

        const actualWidth = video.videoWidth;
        const actualHeight = video.videoHeight;
        const roiWidth = actualWidth * roiWidthPercent;
        const roiHeight = actualHeight * roiHeightPercent;
        const roiX = actualWidth - roiWidth;
        const roiY = actualHeight - roiHeight;

        roiCtx.drawImage(
            video,
            roiX, roiY, roiWidth, roiHeight,
            0, 0, roiCanvas.width, roiCanvas.height
        );

        if (sharpeningEnabled) {
            sharpen(roiCtx, roiCanvas.width, roiCanvas.height, 0.9);
        }
    }
    function drawROI() {
        const video = [...document.querySelectorAll('video')].reverse().find(v => v.readyState >= 2);
        if (!video) return;

        const actualWidth = video.videoWidth;
        const actualHeight = video.videoHeight;
        const roiWidth = actualWidth * roiWidthPercent;
        const roiHeight = actualHeight * roiHeightPercent;
        const roiX = actualWidth - roiWidth;
        const roiY = actualHeight - roiHeight;

        ctx.drawImage(
            video,
            roiX, roiY, roiWidth, roiHeight,
            0, 0, canvas.width, canvas.height
        );

        if (sharpeningEnabled) {
            sharpen(ctx, canvas.width, canvas.height, 0.9);
        }
    }

    function updateCanvasSize() {
        const fixedWidth = Math.round(428 * (0.36 / 0.335)); // ≈ 459
        const fixedHeight = 420;

        canvas.width = fixedWidth;
        canvas.height = fixedHeight;
        roiCanvas.width = canvas.width;
        roiCanvas.height = canvas.height;
        canvas.style.width = `${fixedWidth * zoomFactor}px`;
        canvas.style.height = `${fixedHeight * zoomFactor}px`;
        frame.style.width = `${fixedWidth * zoomFactor}px`;
        frame.style.height = `${fixedHeight * zoomFactor + 60}px`;

        createGrid();
        updateROI();
    }

    // ─── DRAW STATUS CANVASES (scaled to actual video resolution) ─────────────────
    function drawStatus() {
        const video = [...document.querySelectorAll('video')].reverse().find(v => v.readyState >= 2);
        if (!video) return;

        const actualWidth = video.videoWidth;
        const actualHeight = video.videoHeight;
        const scaleX = actualWidth / 1920;
        const scaleY = actualHeight / 1080;

        statusCanvases.forEach(({ canvas: sc, ctx: sctx, region }) => {
            const sx = region.sx * scaleX;
            const sy = region.sy * scaleY;
            const sw = region.sw * scaleX;
            const sh = region.sh * scaleY;

            sctx.clearRect(0, 0, sc.width, sc.height);
            sctx.drawImage(
                video,
                sx, sy, sw, sh,
                0, 0, sc.width, sc.height
            );
        });
    }
    // ────────────────────────────────────────────────────────────────────────────

    function render() {
        // Skip if minimized or canvas is hidden
        if (isMinimized || canvas.style.display === 'none') {
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(roiCanvas, 0, 0);
        createGrid();
        if (statusEnabled) drawStatus();

        if (!document.hidden) {
            renderHandle = requestAnimationFrame(render);
        } else {
            renderHandle = setTimeout(render, 1000 / 30);
        }
    }


    function minimizeCanvas() {
        isMinimized = true;
        if (renderHandle) {
            if (typeof renderHandle === 'number') {
                cancelAnimationFrame(renderHandle);
            } else {
                clearTimeout(renderHandle);
            }
        }

        canvas.style.display = 'none';
        frame.style.height = '0px';
        frame.style.width = '0px';

        const ctrl = document.getElementById('control-container');
        if (ctrl) ctrl.style.display = 'none';

        const btns = document.getElementById('button-container');
        if (btns) btns.style.display = 'none';

        const cfg = document.getElementById('config-panel');
        if (cfg) cfg.style.display = 'none';

        const extraCfg = document.getElementById('extra-config-panel');
        if (extraCfg) extraCfg.style.display = 'none';

        const statusCont = document.getElementById('status-container');
        if (statusCont) statusCont.style.display = 'none';

        const restoreBtn = document.getElementById('restore-button');
        if (restoreBtn) restoreBtn.style.display = 'block';

        if (minimizeBtn && minimizeBtn.parentElement) {
            minimizeBtn.remove();
            minimizeBtn = null;
        }
    }

    function restoreCanvas() {
        isMinimized = false;
        canvas.style.display = 'block';
        updateCanvasSize();
        render();

        frame.style.height = `${canvas.height * zoomFactor + 40}px`;
        frame.style.width = `${canvas.width * zoomFactor}px`;

        const ctrl = document.getElementById('control-container');
        if (ctrl) ctrl.style.display = 'block';

        const btns = document.getElementById('button-container');
        if (btns) btns.style.display = 'flex';

        const restoreBtn = document.getElementById('restore-button');
        if (restoreBtn) restoreBtn.style.display = 'none';

        const statusCont = document.getElementById('status-container');
        if (statusCont) statusCont.style.display = statusEnabled ? 'block' : 'none';

        if (showMinimizeButtons && !minimizeBtn) {
            minimizeBtn = document.createElement('button');
            minimizeBtn.textContent = 'X';
            Object.assign(minimizeBtn.style, {
                position: 'absolute',
                top: '4px',
                left: '4px',
                width: '24px',
                height: '24px',
                fontWeight: 'bold',
                fontSize: '16px',
                lineHeight: '22px',
                textAlign: 'center',
                zIndex: 10002,
                background: '#f0f0f0',
                border: '1px solid #444',
                borderRadius: '4px',
                cursor: 'pointer',
                padding: '0',
                color: 'black'
            });
            minimizeBtn.onclick = minimizeCanvas;
            frame.appendChild(minimizeBtn);
        }
    }
function onCanvasMouseDown(e) {
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const { clueW, clueH, cellSize, ox, oy } = computeGridGeometry();
  const yOverGrid = (y >= oy && y < oy + size * cellSize);

  // --- Top clue band (column dashes) ---
  const inTopClues = (x >= ox && x < ox + size * cellSize && y >= oy - clueH && y < oy);
  if (inTopClues) {
    const col = Math.floor((x - ox) / cellSize);
    if (col >= 0 && col < size) {
      const pos = y - (oy - clueH); // vertical offset inside [0..clueH]
      if (e.button === 0) addColDash(col, pos, clueH);     // Right click: add
      else if (e.button === 2) removeNearestColDash(col, pos, 10); // Left: remove
      createGrid();
      return;
    }
  }

  // --- Left clue band (row dashes) ---
  const inLeftClues = (x < ox && yOverGrid);
  if (inLeftClues) {
    const row = Math.floor((y - oy) / cellSize);
    if (row >= 0 && row < size) {
      if (e.button === 0) addRowDash(row, x);            // Right click: add at canvas X
      else if (e.button === 2) removeNearestRowDash(row, x, 10); // Left: remove nearest
      createGrid();
      return;
    }
  }

  // --- Otherwise: grid draw/drag like before ---
  const c = Math.floor((x - ox) / cellSize);
  const r = Math.floor((y - oy) / cellSize);

  if (r >= 0 && r < size && c >= 0 && c < size) {
    isMarking = true;
    markValue = (e.button === 0) ? 1 : 2;
    eraseMode = (cellStates[r][c] === markValue);

    currentAction = [];
    const prevValue = cellStates[r][c];
    const newValue = eraseMode ? 0 : markValue;

    cellStates[r][c] = newValue;
    currentAction = [{ row: r, col: c, previous: prevValue, newValue }];
    createGrid();
  } else {
    isDragging = true;
    dragOffsetX = e.clientX - frame.offsetLeft;
    dragOffsetY = e.clientY - frame.offsetTop;
  }
}
    function onCanvasMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const { clueW, clueH, cellSize, ox, oy } = computeGridGeometry();

  // Determine indices if inside grid
  const c = Math.floor((x - ox) / cellSize);
  const r = Math.floor((y - oy) / cellSize);

  // Extended hover defaults
  let newRow = -1, newCol = -1;

  // Row highlight over full vertical grid span, regardless of X (so it works over left clues)
  const yOverGrid = (y >= oy && y < oy + size * cellSize);
  if (yOverGrid) {
    const ry = Math.floor((y - oy) / cellSize);
    if (ry >= 0 && ry < size) newRow = ry;
  }

  // Column highlight in top clue band
  const inTopClues = (x >= ox && x < ox + size * cellSize && y >= oy - clueH && y < oy);
  if (inTopClues) {
    const col = Math.floor((x - ox) / cellSize);
    if (col >= 0 && col < size) newCol = col;
  }

  // Inside grid gives both
  if (r >= 0 && r < size && c >= 0 && c < size) {
    newRow = r;
    newCol = c;
  }

  hoveredRow = newRow;
  hoveredCol = newCol;

  // Drag-paint inside grid
  if (isMarking && newRow >= 0 && newCol >= 0) {
    const targetValue = eraseMode ? 0 : markValue;
    if (cellStates[newRow][newCol] !== targetValue) {
      if (!currentAction) currentAction = [];
      currentAction.push({
        row: newRow, col: newCol,
        previous: cellStates[newRow][newCol],
        newValue: targetValue
      });
      cellStates[newRow][newCol] = targetValue;
    }
  }

  createGrid();
}


    function setupCanvas() {
        frame = document.createElement('div');
        frame.id = 'draggable-frame';
        frame.style.cssText = `
            position: fixed; top: 20px; left: 20px; background: black;
            border: 2px solid #555; border-radius: 8px; z-index: 1000;
        `;
        canvas = document.createElement('canvas');
        canvas.id = 'canvas';
        frame.appendChild(canvas);
        document.body.appendChild(frame);
        ctx = canvas.getContext('2d');

        // ─── ALWAYS create “Restore” button, hidden by default ──────────────────
        const restoreBtn = document.createElement('button');
        restoreBtn.id = 'restore-button';
        restoreBtn.textContent = 'Restore nonogram overlay';
        Object.assign(restoreBtn.style, {
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            zIndex: '10003',
            padding: '6px 12px',
            background: '#00cc44',
            boxShadow: '0 0 8px #00cc44',
            color: 'white',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'none'
        });
        restoreBtn.onclick = () => restoreCanvas();

        const video = [...document.querySelectorAll('video')].reverse().find(v => v.readyState >= 2);
        if (video && video.parentElement) {
            video.parentElement.style.position = 'relative';
            video.parentElement.appendChild(restoreBtn);
        } else {
            document.body.appendChild(restoreBtn);
        }
        // ────────────────────────────────────────────────────────────────────────

        if (showMinimizeButtons) {
            minimizeBtn = document.createElement('button');
            minimizeBtn.textContent = 'X';
            Object.assign(minimizeBtn.style, {
                position: 'absolute',
                top: '4px',
                left: '4px',
                width: '24px',
                height: '24px',
                fontWeight: 'bold',
                fontSize: '16px',
                lineHeight: '22px',
                textAlign: 'center',
                zIndex: 10002,
                background: '#f0f0f0',
                border: '1px solid #444',
                borderRadius: '4px',
                cursor: 'pointer',
                padding: '0',
                color: 'black'
            });
            minimizeBtn.onclick = minimizeCanvas;
            frame.appendChild(minimizeBtn);
        }

canvas.addEventListener('mousedown', onCanvasMouseDown);

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                frame.style.left = `${e.clientX - dragOffsetX}px`;
                frame.style.top = `${e.clientY - dragOffsetY}px`;
            }
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
            isMarking = false;

            if (currentAction && currentAction.length) {
                moveHistory.push(currentAction);
            }
            currentAction = null;
        });

  canvas.addEventListener('mousemove', onCanvasMouseMove);

        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

function createMainButtons() {
    // clear any previous monitor interval to avoid duplicates
    if (window.redeemMonitorIntervalId) {
        clearInterval(window.redeemMonitorIntervalId);
        window.redeemMonitorIntervalId = null;
    }

    const container = document.createElement('div');
    container.id = 'button-container';
    container.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        padding: 6px 8px;
        z-index: 10001;
        pointer-events: auto;
        background: rgba(0,0,0,0.5);
        border-top: 1px solid #333;
    `;
    frame.appendChild(container);

    const makeBtn = (label, onClick) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding: 4px 8px;
            background: #fff;
            border: 1px solid #000;
            border-radius: 3px;
            font-size: 13px;
            color: black;
            cursor: pointer;
            transition: background 0.15s ease, opacity 0.15s ease;
        `;
        btn.onmouseenter = () => btn.style.background = '#f0f0f0';
        btn.onmouseleave = () => btn.style.background = '#fff';
        btn.onclick = onClick;
        return btn;
    };

    // Left‐aligned buttons
    exportFillBtn  = container.appendChild(makeBtn('Export !fill',  exportCells));
    exportEmptyBtn = container.appendChild(makeBtn('Export !empty', exportWhiteCells));
    container.appendChild(makeBtn('Undo', () => {
        if (!moveHistory.length) return;
        const lastAction = moveHistory.pop();
        lastAction.forEach(({ row, col, previous, newValue }) => {
            const coord = `${String.fromCharCode(97 + col)}${row + 1}`;
            if (newValue === 1) lastExported.delete(coord);
            if (newValue === 2) lastExportedWhite.delete(coord);
            cellStates[row][col] = previous;
        });
        createGrid();
    }));

    // Spacer pushes the next buttons to the right
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    container.appendChild(spacer);

    // Right‐aligned buttons
    container.appendChild(makeBtn('reset export', exportAllCells));
    container.appendChild(makeBtn('Clean grid', cleanAll));
    container.appendChild(makeBtn('⚙️ Config', () => {
        toggleExtraConfigPanel();
    }));

    // ---- Activity Coupon button (special behaviour) ----
    const activityBtn = makeBtn('🎟️ Activity Coupon', async () => {
        if (activityBtn.disabled) return;
        try {
            activityBtn.disabled = true;
            activityBtn.style.opacity = '0.7';
            activityBtn.textContent = '⏳ Redeeming...';
            await redeemAndTrack(); // uses attemptRedeemCycle() and records timestamp
        } catch (e) {
            console.error('Redeem error:', e);
        } finally {
            // restore text (icon + label)
            activityBtn.textContent = '🎟️ Activity Coupon';
            activityBtn.disabled = false;
            activityBtn.style.opacity = '1';
            updateActivityBtnStyle(activityBtn);
        }
    });

    // override hover handlers to respect alert state
    activityBtn.onmouseenter = () => {
        const state = activityBtn.dataset.alert;
        if (!state) activityBtn.style.background = '#f0f0f0';
        else if (state === 'warning') activityBtn.style.background = '#ff2a2a';
        else if (state === 'overdue') activityBtn.style.background = '#8b1a1a';
    };
    activityBtn.onmouseleave = () => {
        updateActivityBtnStyle(activityBtn);
    };

    // helper to set the activity button style based on minutes since last redeem
    function updateActivityBtnStyle(btn) {
        const mins = (typeof minutesSinceRedeem === 'function') ? minutesSinceRedeem() : Infinity;

        // default (fresh): white background, black text, normal border
        if (isNaN(mins) || mins < 30) {
            btn.dataset.alert = '';
            btn.style.background = '#fff';
            btn.style.color = 'black';
            btn.style.border = '1px solid #000';
        }
        // warning zone: 30–45 minutes
        else if (mins >= 30 && mins <= 45) {
            btn.dataset.alert = 'warning';
            btn.style.background = '#ff4444';
            btn.style.color = 'white';
            btn.style.border = '1px solid #cc0000';
        }
        // overdue: >45 minutes
        else {
            btn.dataset.alert = 'overdue';
            btn.style.background = '#b22222';
            btn.style.color = 'white';
            btn.style.border = '1px solid #800000';
        }
    }

    // append activity button last (right side)
    container.appendChild(activityBtn);

    // start periodic monitor that updates only the activity button
    updateActivityBtnStyle(activityBtn); // immediate update
    window.redeemMonitorIntervalId = setInterval(() => {
        updateActivityBtnStyle(activityBtn);
    }, 30_000); // every 30s
}


    let labelMap = {};
    let controlSections = [];
    function createControlPanel() {
        const controlContainer = document.createElement('div');
        controlContainer.id = 'control-container';
        Object.assign(controlContainer.style, {
            position: 'absolute',
            right: '-160px',
            top: '0',
            zIndex: '10001',
            padding: '8px',
            background: '#fff',
            border: '1px solid #000',
            borderRadius: '4px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            lineHeight: '1.4em',
            color: 'black',
            width: '160px'
        });

        frame.appendChild(controlContainer);

        labelMap = {};
        controlSections = [
            {
                key: 'size', label: 'Grid size',
                get: () => size,
                dec: () => { disableShrinks(); size = Math.max(1, size - 1); loadLayout(); initCells(); updateCanvasSize(); updateAllLabels(); },
                inc: () => { disableShrinks(); size++; loadLayout(); initCells(); updateCanvasSize(); updateAllLabels(); }
            },
            {
                key: 'cols', label: 'Col clues',
                get: () => colClueCount,
                dec: () => { disableShrinks(); colClueCount = Math.max(1, colClueCount - 1); loadLayout(); initCells(); updateCanvasSize(); updateAllLabels(); },
                inc: () => { disableShrinks(); colClueCount++; loadLayout(); initCells(); updateCanvasSize(); updateAllLabels(); }
            },
            {
                key: 'fine', label: 'Fine tune',
                get: () => fineTune,
                dec: () => { disableShrinks(); fineTune--; saveLayout(); updateCanvasSize(); updateAllLabels(); },
                inc: () => { disableShrinks(); fineTune++; saveLayout(); updateCanvasSize(); updateAllLabels(); }
            }
        ];

        controlSections.forEach((s, i) => {
            const sec = document.createElement('div');
            sec.id = `section-${s.key}`;
            if (s.key === 'fine' && !fineTuningEnabled) {
                sec.style.display = 'none';
            }

            const lbl = document.createElement('div');
            lbl.textContent = `${s.label}: ${s.get()}`;
            labelMap[s.key] = lbl;
            lbl.style.fontWeight = 'bold';
            lbl.style.marginBottom = '4px';
            sec.appendChild(lbl);

            const row = document.createElement('div');
            Object.assign(row.style, {
                display: 'flex',
                gap: '4px',
                marginBottom: '8px',
                alignItems: 'center'
            });

            [['−', s.dec], ['+', s.inc]].forEach(([symbol, fn]) => {
                const btn = document.createElement('button');
                btn.textContent = symbol;
                Object.assign(btn.style, {
                    width: '28px',
                    height: '28px',
                    border: '1px solid #007bff',
                    borderRadius: '4px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    backgroundColor: '#007bff',
                    color: 'white',
                    textAlign: 'center'
                });
                btn.addEventListener('click', () => {
                    fn();
                    lbl.textContent = `${s.label}: ${s.get()}`;
                });
                row.appendChild(btn);
            });

            if (s.key === 'size') {
                const spacer = document.createElement('div');
                spacer.style.flex = '1';
                row.appendChild(spacer);

                const resetBtn = document.createElement('button');
                resetBtn.textContent = '4';
                Object.assign(resetBtn.style, {
                    width: '28px',
                    height: '28px',
                    border: '1px solid #28a745',
                    borderRadius: '4px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    backgroundColor: '#28a745',
                    color: 'white',
                    textAlign: 'center'
                });
                resetBtn.addEventListener('click', () => {
                    saveLayout();
                    size = 4;
                    rowClueCount = 1;
                    colClueCount = 1;
                    initCells();
                    updateCanvasSize();
                    lbl.textContent = `${s.label}: ${s.get()}`;
                });
                row.appendChild(resetBtn);
            }

            sec.appendChild(row);
            controlContainer.appendChild(sec);
            if (i < controlSections.length - 1) controlContainer.appendChild(document.createElement('hr'));
        });

        // ─── MAGNIFICATION SECTION ────────────────────────────────────────────────
        const magSec = document.createElement('div');
        magSec.id = 'section-zoom';

        const magLbl = document.createElement('div');
        magLbl.textContent = 'Magnification';
        magLbl.style.fontWeight = 'bold';
        magLbl.style.marginBottom = '4px';
        magSec.appendChild(magLbl);

        const magRow = document.createElement('div');
        Object.assign(magRow.style, {
            display: 'flex',
            gap: '4px',
            marginBottom: '8px',
            alignItems: 'center'
        });

        const makeZoomBtn = (label, onClick) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            Object.assign(btn.style, {
                width: '28px',
                height: '28px',
                border: '1px solid #007bff',
                borderRadius: '4px',
                fontSize: '16px',
                cursor: 'pointer',
                backgroundColor: '#007bff',
                color: 'white',
                textAlign: 'center'
            });
            btn.addEventListener('click', onClick);
            return btn;
        };

        magRow.appendChild(makeZoomBtn('−', () => {
            zoomFactor = Math.max(0.1, zoomFactor * 0.9);
            updateCanvasSize();
        }));
        magRow.appendChild(makeZoomBtn('+', () => {
            zoomFactor = zoomFactor * 1.1;
            updateCanvasSize();
        }));

        magSec.appendChild(magRow);
        controlContainer.appendChild(magSec);
    }

    function updateAllLabels() {
        Object.entries(labelMap).forEach(([k, lbl]) => {
            const section = controlSections.find(s => s.key === k);
            if (section) lbl.textContent = `${section.label}: ${section.get()}`;
        });
    }

    //
    // ─── EXTRA CONFIG PANEL ───────────────────────────────────────────────────────
    //
    function createExtraConfigPanel() {
        if (document.getElementById('extra-config-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'extra-config-panel';
        panel.style.cssText = `
        position: absolute;
        top: 40px;
        left: 0;
        background: #f9f9f9;
        padding: 12px;
        border: 1px solid #333;
        border-radius: 6px;
        z-index: 10002;
        display: none;
        color: black;
        font-size: 14px;
        width: 200px;
    `;

        // 1) Minimize toggle
        const minDiv = document.createElement('div');
        const minChk = document.createElement('input');
        minChk.type = 'checkbox';
        minChk.id = 'chk-minimize';
        minChk.checked = showMinimizeButtons;
        minChk.style.marginRight = '6px';
        minChk.addEventListener('change', () => {
            showMinimizeButtons = minChk.checked;
            uiConfig.showMinimizeButtons = showMinimizeButtons;
            saveUIConfig();
            if (showMinimizeButtons) {
                if (!minimizeBtn && !isMinimized) {
                    minimizeBtn = document.createElement('button');
                    minimizeBtn.textContent = 'X';
                    Object.assign(minimizeBtn.style, {
                        position: 'absolute',
                        top: '4px',
                        left: '4px',
                        width: '24px',
                        height: '24px',
                        fontWeight: 'bold',
                        fontSize: '16px',
                        lineHeight: '22px',
                        textAlign: 'center',
                        zIndex: 10002,
                        background: '#f0f0f0',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        padding: '0',
                        color: 'black'
                    });
                    minimizeBtn.onclick = minimizeCanvas;
                    frame.appendChild(minimizeBtn);
                }
            } else {
                if (minimizeBtn && minimizeBtn.parentElement) {
                    minimizeBtn.remove();
                    minimizeBtn = null;
                }
                const restoreBtn = document.getElementById('restore-button');
                if (restoreBtn) restoreBtn.style.display = 'none';
            }
        });
        const minLabel = document.createElement('label');
        minLabel.htmlFor = 'chk-minimize';
        minLabel.textContent = 'Enable minimize/restore';
        minDiv.appendChild(minChk);
        minDiv.appendChild(minLabel);

        // 2) Blue fill toggle
        const blueDiv = document.createElement('div');
        blueDiv.style.marginTop = '8px';
        const blueChk = document.createElement('input');
        blueChk.type = 'checkbox';
        blueChk.id = 'chk-bluefill';
        blueChk.checked = useBlueFill;
        blueChk.style.marginRight = '6px';
        blueChk.addEventListener('change', () => {
            useBlueFill = blueChk.checked;
            uiConfig.useBlueFill = useBlueFill;
            saveUIConfig();
            createGrid();
        });
        const blueLabel = document.createElement('label');
        blueLabel.htmlFor = 'chk-bluefill';
        blueLabel.textContent = 'Use blue fill color';
        blueDiv.appendChild(blueChk);
        blueDiv.appendChild(blueLabel);

        // 3) Status-canvas toggle
        const statusDivToggle = document.createElement('div');
        statusDivToggle.style.marginTop = '8px';
        const statusChk = document.createElement('input');
        statusChk.type = 'checkbox';
        statusChk.id = 'chk-status';
        statusChk.checked = statusEnabled;
        statusChk.style.marginRight = '6px';
        statusChk.addEventListener('change', () => {
            statusEnabled = statusChk.checked;
            uiConfig.statusEnabled = statusEnabled;
            saveUIConfig();
            const scCont = document.getElementById('status-container');
            if (scCont) scCont.style.display = statusEnabled ? 'block' : 'none';
        });
        const statusLabel = document.createElement('label');
        statusLabel.htmlFor = 'chk-status';
        statusLabel.textContent = 'Status canvas';
        statusDivToggle.appendChild(statusChk);
        statusDivToggle.appendChild(statusLabel);

        // 4) Auto-send toggle (no OAuth)  ← NEW
        const autosendDiv = document.createElement('div');
        autosendDiv.style.marginTop = '8px';
        const autosendChk = document.createElement('input');
        autosendChk.type = 'checkbox';
        autosendChk.id = 'chk-autosend';
        autosendChk.checked = autosendEnabled; // requires: let autosendEnabled = uiConfig.autosendEnabled ?? false;
        autosendChk.style.marginRight = '6px';
        autosendChk.addEventListener('change', () => {
            autosendEnabled = autosendChk.checked;
            uiConfig.autosendEnabled = autosendEnabled;
            saveUIConfig();

            if (autosendEnabled) {
                // Start queue + cooldown progress loops
                if (typeof ensureSendLoop === 'function') ensureSendLoop();
                if (typeof ensureProgressLoop === 'function') ensureProgressLoop();
            } else {
                // Stop/clear the progress UI
                if (typeof stopProgressLoop === 'function') stopProgressLoop();
            }
        });
        const autosendLabel = document.createElement('label');
        autosendLabel.htmlFor = 'chk-autosend';
        autosendLabel.textContent = 'Auto-send chat cmd';
        autosendDiv.appendChild(autosendChk);
        autosendDiv.appendChild(autosendLabel);

        // 5) Fine-tuning toggle
        const fineDiv = document.createElement('div');
        fineDiv.style.marginTop = '8px';
        const fineChk = document.createElement('input');
        fineChk.type = 'checkbox';
        fineChk.id = 'chk-fine';
        fineChk.checked = fineTuningEnabled;
        fineChk.style.marginRight = '6px';
        fineChk.addEventListener('change', () => {
            fineTuningEnabled = fineChk.checked;
            uiConfig.fineTuningEnabled = fineTuningEnabled;
            saveUIConfig();
            const fineSection = document.getElementById('section-fine');
            if (fineSection) {
                fineSection.style.display = fineTuningEnabled ? 'block' : 'none';
            }
        });
        const fineLabel = document.createElement('label');
        fineLabel.htmlFor = 'chk-fine';
        fineLabel.textContent = 'Enable fine-tune controls';
        fineDiv.appendChild(fineChk);
        fineDiv.appendChild(fineLabel);

        // 6) Sharpen toggle
        const sharpenDiv = document.createElement('div');
        sharpenDiv.style.marginTop = '8px';
        const sharpenChk = document.createElement('input');
        sharpenChk.type = 'checkbox';
        sharpenChk.id = 'chk-sharpen';
        sharpenChk.checked = sharpeningEnabled;
        sharpenChk.style.marginRight = '6px';
        sharpenChk.addEventListener('change', () => {
            sharpeningEnabled = sharpenChk.checked;
            uiConfig.sharpeningEnabled = sharpeningEnabled;
            saveUIConfig();
        });
        const sharpenLabel = document.createElement('label');
        sharpenLabel.htmlFor = 'chk-sharpen';
        sharpenLabel.textContent = 'Enable sharpen filter';
        sharpenDiv.appendChild(sharpenChk);
        sharpenDiv.appendChild(sharpenLabel);
        // 7) Guard Export toggle
        const guardDiv = document.createElement('div');
        guardDiv.style.marginTop = '8px';

        const guardChk = document.createElement('input');
        guardChk.type = 'checkbox';
        guardChk.id = 'chk-guard';
        guardChk.checked = guard_Export; // requires: let guard_Export = uiConfig.guard_Export ?? true;
        guardChk.style.marginRight = '6px';
        guardChk.addEventListener('change', () => {
            guard_Export = guardChk.checked;
            uiConfig.guard_Export = guard_Export;
            saveUIConfig();
        });

        const guardLabel = document.createElement('label');
        guardLabel.htmlFor = 'chk-guard';
        guardLabel.textContent = 'Guard exports (redeem check)';
        guardDiv.appendChild(guardChk);
        guardDiv.appendChild(guardLabel);

        // Add it to panel
        panel.appendChild(autosendDiv); // ← NEW placement
        panel.appendChild(guardDiv);
        // Assemble in order
        panel.appendChild(minDiv);
        panel.appendChild(blueDiv);
        panel.appendChild(statusDivToggle);
        
        panel.appendChild(fineDiv);
        panel.appendChild(sharpenDiv);

        frame.appendChild(panel);
    }

    function toggleExtraConfigPanel() {
        const panel = document.getElementById('extra-config-panel');
        if (!panel) return;
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    function createConfigPanel() {
        if (document.getElementById('config-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'config-panel';
        panel.style.cssText = `
            position: fixed;
            top: 60px;
            left: 60px;
            background: #fff;
            padding: 12px;
            border: 1px solid #000;
            border-radius: 6px;
            z-index: 10002;
            display: none;
            color: black;
            font-size: 15px;
            font-weight: bold;
            line-height: 1.6em;
        `;
        panel.innerHTML = `
            <label>Size: <input id="cfg-size" type="number" value="${size}" /></label><br/>
            <label>Col Clues: <input id="cfg-cols" type="number" value="${colClueCount}" /></label><br/>
            <label>Fine Tune: <input id="cfg-fine" type="number" value="${fineTune}" /></label><br/>
            <label>Anchor X: <input id="cfg-anchorX" type="number" value="${anchorX}" /></label><br/>
            <label>Anchor Y: <input id="cfg-anchorY" type="number" value="${anchorY}" /></label><br/>
            <button id="cfg-apply">Apply</button>
            <button id="cfg-close">Close</button>
        `;
        document.body.appendChild(panel);

        panel.querySelector('#cfg-apply').onclick = () => {
            size = +panel.querySelector('#cfg-size').value;
            colClueCount = +panel.querySelector('#cfg-cols').value;
            fineTune = +panel.querySelector('#cfg-fine').value;
            anchorX = +panel.querySelector('#cfg-anchorX').value;
            anchorY = +panel.querySelector('#cfg-anchorY').value;
            saveLayout();
            initCells();
            updateCanvasSize();
        };

        panel.querySelector('#cfg-close').onclick = () => {
            panel.style.display = 'none';
        };
    }

    //
    // ─── STATUS CONTAINER (three small canvases below control‐panel) ─────────────
    //
    function createStatusContainer() {
        if (document.getElementById('status-container')) return;
        const controlContainer = document.getElementById('control-container');
        if (!controlContainer) return;

        const scCont = document.createElement('div');
        scCont.id = 'status-container';
        scCont.style.cssText = `
            display: none;
            margin-top: 8px;
            width: 100%;
            text-align: center;
        `;

        const cw = controlContainer.clientWidth - 20;
        const ch = Math.round((cw * 80) / 250);

        statusRegions.forEach((region, idx) => {
            const sc = document.createElement('canvas');
            sc.id = `status-canvas-${idx}`;
            sc.width = cw;
            sc.height = ch;
            sc.style.cssText = `
                display: block;
                margin: 4px auto;
                width: ${cw}px;
                height: ${ch}px;
                border: 1px solid #333;
                background: black;
            `;
            scCont.appendChild(sc);

            const sctx = sc.getContext('2d');
            statusCanvases.push({ canvas: sc, ctx: sctx, region });
        });

        controlContainer.appendChild(scCont);
        scCont.style.display = statusEnabled ? 'block' : 'none';
    }

    function createControlAndStatus() {
        createControlPanel();
        createStatusContainer();
    }

    window.addEventListener('load', () => {
        setupCanvas();
        initCells();
        updateCanvasSize();
        createMainButtons();
        createConfigPanel();
        createControlAndStatus();
        createExtraConfigPanel();
        if (autosendEnabled) {
            // show “Ready” state right away
            nextSendAt = Date.now();
            ensureProgressLoop();
            // send loop starts itself when there’s something in the queue
        }
        render();
        setInterval(updateROI, 1000); // update ROI once per second
    });

})();
