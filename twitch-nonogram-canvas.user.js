// ==UserScript==
// @name         Twitch Nonogram Grid with canvas
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Nonogram overlay + status bars + persistent config
// @author       mrpantera+menels+a lot of chatgpt
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
        fineTuningEnabled:   false
    };

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

    const DEFAULT_CONF = { anchorX: 10, anchorY: 10, zoomFactor: 1.4, fineTune: 0 };
    let size = 4, rowClueCount = 1, colClueCount = 1, ratio = 1.0;
    let anchorX = DEFAULT_CONF.anchorX, anchorY = DEFAULT_CONF.anchorY;
    let zoomFactor = DEFAULT_CONF.zoomFactor, fineTune = DEFAULT_CONF.fineTune;
    let roiWidthPercent = 0.36, roiHeightPercent = 0.584;
    let configs = JSON.parse(localStorage.getItem('nonogramConfigMap')) || {};

    let canvas, ctx, frame;
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
    let lastExported = new Set(), lastExportedWhite = new Set(), cellStates = [];
    let hoveredRow = -1, hoveredCol = -1;
    let isMarking = false, markValue = 0, eraseMode = false;
    let isMinimized = false, renderHandle = null;
    let minimizeBtn;
    let moveHistory = [], currentAction = null;

    // ─── STATUS BAR REGIONS (for 1920×1080) ──────────────────────────────────────
    const statusRegions = [
        { sx: 200, sy: 970, sw: 250, sh: 80 },
        { sx: 500, sy: 970, sw: 250, sh: 80 },
        { sx: 800, sy: 970, sw: 250, sh: 80 }
    ];
    let statusCanvases = [];

    const sizeLookup = {
        "4_1": { cellSize: 90.47, anchorX: 11, anchorY: 11 },
        "4_2": { cellSize: 85.2,  anchorX: 11, anchorY: 11 },
        "5_1": { cellSize: 72.19, anchorX: 11, anchorY: 11 },
        "5_2": { cellSize: 68.35, anchorX: 11, anchorY: 11 },
        "5_3": { cellSize: 64.35, anchorX: 11, anchorY: 11 },
        "6_1": { cellSize: 60.32, anchorX: 11, anchorY: 11 },
        "6_2": { cellSize: 57.12, anchorX: 11, anchorY: 11 },
        "6_3": { cellSize: 54.0,  anchorX: 11, anchorY: 11 },
        "7_1": { cellSize: 51.57, anchorX: 11, anchorY: 11 },
        "7_2": { cellSize: 48.96, anchorX: 11, anchorY: 11 },
        "7_3": { cellSize: 46.29, anchorX: 11, anchorY: 11 },
        "7_4": { cellSize: 43.68, anchorX: 11, anchorY: 11 },
        "8_1": { cellSize: 45.24, anchorX: 11, anchorY: 11 },
        "8_2": { cellSize: 43.04, anchorX: 11, anchorY: 11 },
        "8_3": { cellSize: 40.75, anchorX: 11, anchorY: 11 },
        "8_4": { cellSize: 38.59, anchorX: 11, anchorY: 11 },
        "9_1": { cellSize: 40.42, anchorX: 10, anchorY: 10 },
        "9_2": { cellSize: 38.55, anchorX: 10, anchorY: 10 },
        "9_3": { cellSize: 36.61, anchorX: 10, anchorY: 10 },
        "9_4": { cellSize: 34.74, anchorX: 10, anchorY: 10 },
        "9_5": { cellSize: 32.81, anchorX: 10, anchorY: 10 },
        "10_1": { cellSize: 36.48, anchorX: 10, anchorY: 10 },
        "10_2": { cellSize: 34.69, anchorX: 10, anchorY: 10 },
        "10_3": { cellSize: 33.03, anchorX: 10, anchorY: 10 },
        "10_4": { cellSize: 31.27, anchorX: 10, anchorY: 10 },
        "10_5": { cellSize: 29.49, anchorX: 10, anchorY: 10 },
        "11_1": { cellSize: 33.16, anchorX: 10, anchorY: 10 },
        "11_2": { cellSize: 31.54, anchorX: 10, anchorY: 10 },
        "11_3": { cellSize: 30.14, anchorX: 10, anchorY: 10 },
        "11_4": { cellSize: 28.7,  anchorX: 10, anchorY: 10 },
        "11_5": { cellSize: 27.12, anchorX: 10, anchorY: 10 },
        "11_6": { cellSize: 25.53, anchorX: 10, anchorY: 10 },
        "12_1": { cellSize: 30.4,  anchorX: 10, anchorY: 10 },
        "12_2": { cellSize: 29.07, anchorX: 10, anchorY: 10 },
        "12_3": { cellSize: 27.63, anchorX: 10, anchorY: 10 },
        "12_4": { cellSize: 26.24, anchorX: 10, anchorY: 10 },
        "12_5": { cellSize: 24.86, anchorX: 10, anchorY: 10 },
        "12_6": { cellSize: 23.5,  anchorX: 10, anchorY: 10 },
        "13_1": { cellSize: 28.06, anchorX: 10, anchorY: 10 },
        "13_2": { cellSize: 26.96, anchorX: 10, anchorY: 10 },
        "13_3": { cellSize: 25.67, anchorX: 10, anchorY: 10 },
        "13_4": { cellSize: 24.45, anchorX: 10, anchorY: 10 },
        "13_5": { cellSize: 23.24, anchorX: 10, anchorY: 10 },
        "13_6": { cellSize: 22.05, anchorX: 10, anchorY: 10 },
        "13_7": { cellSize: 20.82, anchorX: 10, anchorY: 10 },
        "14_1": { cellSize: 26.13, anchorX: 10, anchorY: 10 },
        "14_2": { cellSize: 24.96, anchorX: 10, anchorY: 10 },
        "14_3": { cellSize: 23.84, anchorX: 10, anchorY: 10 },
        "14_4": { cellSize: 22.68, anchorX: 10, anchorY: 10 },
        "14_5": { cellSize: 21.58, anchorX: 10, anchorY: 10 },
        "14_6": { cellSize: 20.39, anchorX: 10, anchorY: 10 },
        "14_7": { cellSize: 19.28, anchorX: 10, anchorY: 10 },
        "15_1": { cellSize: 24.38, anchorX: 10, anchorY: 10 },
        "15_2": { cellSize: 23.43, anchorX: 10, anchorY: 10 },
        "15_3": { cellSize: 22.39, anchorX: 10, anchorY: 10 },
        "15_4": { cellSize: 21.36, anchorX: 10, anchorY: 10 },
        "15_5": { cellSize: 20.32, anchorX: 10, anchorY: 10 },
        "15_6": { cellSize: 19.35, anchorX: 10, anchorY: 10 },
        "15_7": { cellSize: 18.31, anchorX: 10, anchorY: 10 },
        "15_8": { cellSize: 17.27, anchorX: 10, anchorY: 10 },
        "16_1": { cellSize: 22.92, anchorX: 10, anchorY: 10 },
        "16_2": { cellSize: 22.03, anchorX: 10, anchorY: 10 },
        "16_3": { cellSize: 21.13, anchorX: 10, anchorY: 10 },
        "16_4": { cellSize: 20.21, anchorX: 10, anchorY: 10 },
        "16_5": { cellSize: 19.29, anchorX: 10, anchorY: 10 },
        "16_6": { cellSize: 18.36, anchorX: 10, anchorY: 10 },
        "16_7": { cellSize: 17.43, anchorX: 10, anchorY: 10 },
        "16_8": { cellSize: 16.52, anchorX: 10, anchorY: 10 },
        "17_1": { cellSize: 21.57, anchorX: 10, anchorY: 10 },
        "17_2": { cellSize: 20.73, anchorX: 10, anchorY: 10 },
        "17_3": { cellSize: 19.88, anchorX: 10, anchorY: 10 },
        "17_4": { cellSize: 19.02, anchorX: 10, anchorY: 10 },
        "17_5": { cellSize: 18.15, anchorX: 10, anchorY: 10 },
        "17_6": { cellSize: 17.28, anchorX: 10, anchorY: 10 },
        "17_7": { cellSize: 16.4,  anchorX: 10, anchorY: 10 },
        "17_8": { cellSize: 15.54, anchorX: 10, anchorY: 10 },
        "17_9": { cellSize: 14.76, anchorX: 10, anchorY: 10 },
        "18_1": { cellSize: 20.42, anchorX: 10, anchorY: 10 },
        "18_2": { cellSize: 19.64, anchorX: 10, anchorY: 10 },
        "18_3": { cellSize: 18.89, anchorX: 10, anchorY: 10 },
        "18_4": { cellSize: 18.13, anchorX: 10, anchorY: 10 },
        "18_5": { cellSize: 17.36, anchorX: 10, anchorY: 10 },
        "18_6": { cellSize: 16.52, anchorX: 10, anchorY: 10 },
        "18_7": { cellSize: 15.75, anchorX: 10, anchorY: 10 },
        "18_8": { cellSize: 14.97, anchorX: 10, anchorY: 10 },
        "18_9": { cellSize: 14.26, anchorX: 10, anchorY: 10 },
        "19_1": { cellSize: 19.35, anchorX: 10, anchorY: 10 },
        "19_2": { cellSize: 18.68, anchorX: 10, anchorY: 10 },
        "19_3": { cellSize: 18.02, anchorX: 10, anchorY: 10 },
        "19_4": { cellSize: 17.29, anchorX: 10, anchorY: 10 },
        "19_5": { cellSize: 16.6,  anchorX: 10, anchorY: 10 },
        "19_6": { cellSize: 15.9,  anchorX: 10, anchorY: 10 },
        "19_7": { cellSize: 15.21, anchorX: 10, anchorY: 10 },
        "19_8": { cellSize: 14.46, anchorX: 10, anchorY: 10 },
        "19_9": { cellSize: 13.74, anchorX: 10, anchorY: 10 },
        "19_10": { cellSize: 13.07, anchorX: 10, anchorY: 10 },
        "20_1": { cellSize: 18.43, anchorX: 10, anchorY: 10 },
        "20_2": { cellSize: 17.75, anchorX: 10, anchorY: 10 },
        "20_3": { cellSize: 17.12, anchorX: 10, anchorY: 10 },
        "20_4": { cellSize: 16.43, anchorX: 10, anchorY: 10 },
        "20_5": { cellSize: 15.77, anchorX: 10, anchorY: 10 },
        "20_6": { cellSize: 15.1,  anchorX: 10, anchorY: 10 },
        "20_7": { cellSize: 14.45, anchorX: 10, anchorY: 10 },
        "20_8": { cellSize: 13.74, anchorX: 10, anchorY: 10 },
        "20_9": { cellSize: 13.12, anchorX: 10, anchorY: 10 },
        "20_10": { cellSize: 12.42, anchorX: 10, anchorY: 10 }
    };

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
        if (coords.length) navigator.clipboard.writeText(`!fill ${coords.join(' ')}`);
    }

    // ─── “Export All Black” (ignores lastExported, grabs every filled cell) ─────
    function exportAllCells() {
        const coords = [];
        cellStates.forEach((row, r) => {
            row.forEach((s, c) => {
                if (s === 1) {
                    const coord = `${String.fromCharCode(97 + c)}${r + 1}`;
                    coords.push(coord);
                }
            });
        });
        if (coords.length) {
            navigator.clipboard.writeText(`!fill ${coords.join(' ')}`);
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
            navigator.clipboard.writeText(`!empty ${coords.join(' ')}`);
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
    function disableShrinks() {
        // Placeholder
    }

    function createGrid() {
        const cw = canvas.width, ch = canvas.height;
        ctx.font = `bold 30px Arial`;
        const clueW = ctx.measureText('0'.repeat(rowClueCount)).width;
        const clueH = 30 * colClueCount + 5;
        const layout = getLayoutSettings(size, colClueCount);
        let cellSize, ox, oy;

        if (layout) {
            anchorX = layout.anchorX;
            anchorY = layout.anchorY;
            cellSize = (layout.cellSize * size + fineTune) / size;
        } else {
            console.warn(`Missing layout for size=${size}, colClueCount=${colClueCount}. Falling back.`);
            const gridSize = Math.min(cw - clueW, ch - clueH);
            cellSize = (gridSize + fineTune) / size;
        }

        ox = cw - cellSize * size - anchorX;
        oy = ch - cellSize * size - anchorY;

        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 1;

        // Highlight hovered row/col
        if (hoveredRow >= 0 && hoveredCol >= 0) {
            ctx.fillStyle = 'rgba(100, 150, 255, 0.25)';
            for (let c = 0; c < size; c++) {
                const x = ox + c * cellSize;
                const y = oy + hoveredRow * cellSize;
                ctx.fillRect(x, y, cellSize, cellSize);
            }
            for (let r = 0; r < size; r++) {
                const x = ox + hoveredCol * cellSize;
                const y = oy + r * cellSize;
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        }

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (cellStates[r][c] === 1) {
                    ctx.fillStyle = useBlueFill
                        ? 'rgba(50, 50, 255, 0.7)'
                        : 'rgba(0, 0, 0, 0.7)';
                } else if (cellStates[r][c] === 2) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                }
                const x = ox + c * cellSize;
                const y = oy + r * cellSize;
                ctx.strokeRect(x, y, cellSize, cellSize);
                if (cellStates[r][c] === 1 || cellStates[r][c] === 2) {
                    ctx.fillRect(x, y, cellSize, cellSize);
                    if (cellStates[r][c] === 2) {
                        ctx.fillStyle = 'black';
                    }
                }
            }
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
    }

    function updateCanvasSize() {
        const fixedWidth = Math.round(428 * (0.36 / 0.335)); // ≈ 459
        const fixedHeight = 420;

        canvas.width = fixedWidth;
        canvas.height = fixedHeight;

        canvas.style.width = `${fixedWidth * zoomFactor}px`;
        canvas.style.height = `${fixedHeight * zoomFactor}px`;
        frame.style.width = `${fixedWidth * zoomFactor}px`;
        frame.style.height = `${fixedHeight * zoomFactor + 40}px`;

        createGrid();
        drawROI();
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
        if (isMinimized) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawROI();
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

        canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            const layout = getLayoutSettings(size, colClueCount);
            const clueW = ctx.measureText('0'.repeat(rowClueCount)).width;
            const clueH = 30 * colClueCount + 5;
            const gridSize = Math.min(canvas.width - clueW, canvas.height - clueH);
            const cellSize = layout ? (layout.cellSize * size + fineTune) / size : (gridSize + fineTune) / size;

            const ox = canvas.width - cellSize * size - anchorX;
            const oy = canvas.height - cellSize * size - anchorY;
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
        });

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

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            const layout = getLayoutSettings(size, colClueCount);
            let cellSize, ox, oy;
            if (layout) {
                anchorX = layout.anchorX;
                anchorY = layout.anchorY;
                cellSize = (layout.cellSize * size + fineTune) / size;
            } else {
                const clueW = ctx.measureText('0'.repeat(rowClueCount)).width;
                const clueH = 30 * colClueCount + 5;
                const gridSize = Math.min(canvas.width - clueW, canvas.height - clueH);
                cellSize = (gridSize + fineTune) / size;
            }

            ox = canvas.width - cellSize * size - anchorX;
            oy = canvas.height - cellSize * size - anchorY;
            const c = Math.floor((x - ox) / cellSize);
            const r = Math.floor((y - oy) / cellSize);

            if (r >= 0 && r < size && c >= 0 && c < size) {
                hoveredRow = r;
                hoveredCol = c;
            } else {
                hoveredRow = -1;
                hoveredCol = -1;
            }
            if (isMarking) {
                const c2 = Math.floor((x - ox) / cellSize);
                const r2 = Math.floor((y - oy) / cellSize);
                if (r2 >= 0 && r2 < size && c2 >= 0 && c2 < size) {
                    const targetValue = eraseMode ? 0 : markValue;
                    if (cellStates[r2][c2] !== targetValue) {
                        currentAction.push({
                            row: r2,
                            col: c2,
                            previous: cellStates[r2][c2],
                            newValue: targetValue
                        });
                        cellStates[r2][c2] = targetValue;
                        createGrid();
                    }
                }
            }
        });

        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    function createMainButtons() {
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
                transition: background 0.2s ease;
            `;
            btn.onmouseenter = () => btn.style.background = '#f0f0f0';
            btn.onmouseleave = () => btn.style.background = '#fff';
            btn.onclick = onClick;
            return btn;
        };

        // Left‐aligned buttons
        container.appendChild(makeBtn('Export !fill', exportCells));
        container.appendChild(makeBtn('Export !empty', exportWhiteCells));
        container.appendChild(makeBtn('Undo', () => {
            if (!moveHistory.length) return;
            const lastAction = moveHistory.pop();
            lastAction.forEach(({ row, col, previous, newValue }) => {
                // Compute the coordinate string
                const coord = `${String.fromCharCode(97 + col)}${row + 1}`;

                // If the undone action had painted a black cell (newValue === 1), remove it from lastExported
                if (newValue === 1) {
                    lastExported.delete(coord);
                }

                // If the undone action had painted a white cell (newValue === 2), remove it from lastExportedWhite
                if (newValue === 2) {
                    lastExportedWhite.delete(coord);
                }

                // Revert the cell state
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

        // 3) Status‐canvas toggle
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

        // 4) Fine-tuning toggle
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

        panel.appendChild(minDiv);
        panel.appendChild(blueDiv);
        panel.appendChild(statusDivToggle);
        panel.appendChild(fineDiv);

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
        render();
    });

})();
