// ==UserScript==
// @name         Twitch Nonogram Grid with canvas
// @namespace    http://tampermonkey.net/
// @version      4.12
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
        fineTuningEnabled:   false,
        sharpeningEnabled:   false
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
        { sx: 200, sy: 980, sw: 250, sh: 70 },
        { sx: 500, sy: 980, sw: 250, sh: 70 },
        { sx: 800, sy: 980, sw: 250, sh: 70 }
    ];
    let statusCanvases = [];

    const sizeLookup = {
        "4_1": { cellSize: 92.1, anchorX: 7.75, anchorY: 6.5 },
        "4_2": { cellSize: 86.8, anchorX: 8, anchorY: 6.5 },
        "5_1": { cellSize: 74.8, anchorX: 8, anchorY: 6 },
        "5_2": { cellSize: 71, anchorX: 8, anchorY: 6 },
        "5_3": { cellSize: 66.8, anchorX: 8.25, anchorY: 6.5 },
        "6_1": { cellSize: 61.1, anchorX: 9.25, anchorY: 7.25 },
        "6_2": { cellSize: 58.8, anchorX: 8, anchorY: 6.75 },
        "6_3": { cellSize: 55.9, anchorX: 9, anchorY: 6.75 },
        "7_1": { cellSize: 53.2, anchorX: 9.25, anchorY: 7 },
        "7_2": { cellSize: 50.6, anchorX: 8.5, anchorY: 6.75 },
        "7_3": { cellSize: 47.9, anchorX: 9, anchorY: 7 },
        "7_4": { cellSize: 45.4, anchorX: 8, anchorY: 6.5 },
        "8_1": { cellSize: 46.7, anchorX: 8.25, anchorY: 6.75 },
        "8_2": { cellSize: 43.8, anchorX: 9.75, anchorY: 7.25 },
        "8_3": { cellSize: 41.1, anchorX: 9.5, anchorY: 7.25 },
        "8_4": { cellSize: 38.8, anchorX: 7.75, anchorY: 6 },        
        "9_1": { cellSize: 41.3, anchorX: 8.5, anchorY: 7 },
        "9_2": { cellSize: 38.7, anchorX: 8.75, anchorY: 7 },
        "9_3": { cellSize: 37.2, anchorX: 8.75, anchorY: 7.5 },
        "9_4": { cellSize: 36.1, anchorX: 8, anchorY: 6.5 },
        "9_5": { cellSize: 33.3, anchorX: 8.5, anchorY: 7.25 },
        "10_1": { cellSize: 37.5, anchorX: 7.75, anchorY: 5.75 },
        "10_2": { cellSize: 34.7, anchorX: 8.25, anchorY: 6.25 },
        "10_3": { cellSize: 33.3, anchorX: 8, anchorY: 6.75 },
        "10_4": { cellSize: 32, anchorX: 8.5, anchorY: 6.25 },
        "10_5": { cellSize: 30.7, anchorX: 8.25, anchorY: 6 },
        "11_1": { cellSize: 33.3, anchorX: 8, anchorY: 7 },
        "11_2": { cellSize: 32, anchorX: 9, anchorY: 7 },
        "11_3": { cellSize: 30.7, anchorX: 8.25, anchorY: 6.5 },
        "11_4": { cellSize: 29.4, anchorX: 8.25, anchorY: 6.75 },
        "11_5": { cellSize: 28, anchorX: 8.75, anchorY: 6.5 },
        "11_6": { cellSize: 26.7, anchorX: 9.5, anchorY: 6.5 },
        "12_1": { cellSize: 30.7, anchorX: 7.75, anchorY: 6.25 },
        "12_2": { cellSize: 29.3, anchorX: 8.25, anchorY: 7 },
        "12_3": { cellSize: 28, anchorX: 8.25, anchorY: 7 },
        "12_4": { cellSize: 28, anchorX: 9.5, anchorY: 6.5 },
        "12_5": { cellSize: 26.6, anchorX: 8.5, anchorY: 7 },
        "12_6": { cellSize: 25.3, anchorX: 9.5, anchorY: 6.5 },
        "13_1": { cellSize: 28, anchorX: 9.5, anchorY: 6.5 },
        "13_2": { cellSize: 28, anchorX: 9.5, anchorY: 6.5 },
        "13_3": { cellSize: 26.6, anchorX: 8.5, anchorY: 7 },
        "13_4": { cellSize: 25.4, anchorX: 9.5, anchorY: 7 },
        "13_5": { cellSize: 23.9, anchorX: 9, anchorY: 7 },
        "13_6": { cellSize: 22.7, anchorX: 9.5, anchorY: 6.75 },
        "13_7": { cellSize: 21.4, anchorX: 8.75, anchorY: 6.5 },
        "14_1": { cellSize: 26.7, anchorX: 8.5, anchorY: 7 },
        "14_2": { cellSize: 25.2, anchorX: 8.5, anchorY: 7.5 },
        "14_3": { cellSize: 24, anchorX: 8, anchorY: 7 },
        "14_4": { cellSize: 24, anchorX: 9, anchorY: 6.75 },
        "14_5": { cellSize: 22.7, anchorX: 8.25, anchorY: 6.5 },
        "14_6": { cellSize: 21.3, anchorX: 9.25, anchorY: 7 },
        "14_7": { cellSize: 19.9, anchorX: 8.75, anchorY: 7 },
        "15_1": { cellSize: 25.4, anchorX: 8.5, anchorY: 6.5 },
        "15_2": { cellSize: 24, anchorX: 8.75, anchorY: 7 },
        "15_3": { cellSize: 22.7, anchorX: 8, anchorY: 7 },
        "15_4": { cellSize: 22.7, anchorX: 8.5, anchorY: 7 },
        "15_5": { cellSize: 21.3, anchorX: 8, anchorY: 7 },
        "15_6": { cellSize: 20, anchorX: 9, anchorY: 7 },
        "15_7": { cellSize: 20, anchorX: 8, anchorY: 7 },
        "15_8": { cellSize: 18.7, anchorX: 9, anchorY: 7 },
        "16_1": { cellSize: 22.7, anchorX: 8, anchorY: 6.75 },
        "16_2": { cellSize: 22.7, anchorX: 9.5, anchorY: 6.5 },
        "16_3": { cellSize: 21.3, anchorX: 8, anchorY: 7 },
        "16_4": { cellSize: 21.4, anchorX: 8.5, anchorY: 7 },
        "16_5": { cellSize: 20, anchorX: 8, anchorY: 7 },
        "16_6": { cellSize: 18.7, anchorX: 9, anchorY: 7 },
        "16_7": { cellSize: 18.6, anchorX: 8, anchorY: 7 },
        "16_8": { cellSize: 17.4, anchorX: 9, anchorY: 7 },
        "17_1": { cellSize: 21.3, anchorX: 8, anchorY: 6.5 },
        "17_2": { cellSize: 21.4, anchorX: 9, anchorY: 6.25 },
        "17_3": { cellSize: 20, anchorX: 8, anchorY: 7 },
        "17_4": { cellSize: 20, anchorX: 8.5, anchorY: 7 },
        "17_5": { cellSize: 18.7, anchorX: 8, anchorY: 7 },
        "17_6": { cellSize: 17.3, anchorX: 9.5, anchorY: 7 },
        "17_7": { cellSize: 17.3, anchorX: 8, anchorY: 7 },
        "17_8": { cellSize: 16, anchorX: 9, anchorY: 7 },
        "17_9": { cellSize: 16, anchorX: 9, anchorY: 7 },
        "18_1": { cellSize: 20, anchorX: 8, anchorY: 6.25 },
        "18_2": { cellSize: 20, anchorX: 9.75, anchorY: 6.5 },
        "18_3": { cellSize: 18.7, anchorX: 8, anchorY: 7 },
        "18_4": { cellSize: 18.7, anchorX: 8.5, anchorY: 7 },
        "18_5": { cellSize: 17.3, anchorX: 8, anchorY: 7 },
        "18_6": { cellSize: 17.3, anchorX: 9, anchorY: 7 },
        "18_7": { cellSize: 16, anchorX: 8, anchorY: 7 },
        "18_8": { cellSize: 16, anchorX: 9, anchorY: 7 },
        "18_9": { cellSize: 14.6, anchorX: 9, anchorY: 7 },
        "19_1": { cellSize: 20, anchorX: 8.25, anchorY: 7 },
        "19_2": { cellSize: 18.6, anchorX: 8.25, anchorY: 7.25 },
        "19_3": { cellSize: 18.6, anchorX: 8, anchorY: 7 },
        "19_4": { cellSize: 17.4, anchorX: 8.5, anchorY: 7 },
        "19_5": { cellSize: 17.3, anchorX: 8, anchorY: 7 },
        "19_6": { cellSize: 16, anchorX: 9, anchorY: 7 },
        "19_7": { cellSize: 14.7, anchorX: 8, anchorY: 7 },
        "19_8": { cellSize: 14.7, anchorX: 9, anchorY: 7 },
        "19_9": { cellSize: 13.3, anchorX: 9, anchorY: 7 },
        "19_10": { cellSize: 13.3, anchorX: 9, anchorY: 7 },
        "20_1": { cellSize: 18.6, anchorX: 8, anchorY: 7.25 },
        "20_2": { cellSize: 17.3, anchorX: 8, anchorY: 7 },
        "20_3": { cellSize: 17.3, anchorX: 8, anchorY: 7 },
        "20_4": { cellSize: 16, anchorX: 8.5, anchorY: 7 },
        "20_5": { cellSize: 16, anchorX: 8, anchorY: 7 },
        "20_6": { cellSize: 14.65, anchorX: 9, anchorY: 7 },
        "20_7": { cellSize: 14.7, anchorX: 8, anchorY: 7 },
        "20_8": { cellSize: 13.3, anchorX: 9, anchorY: 7 },
        "20_9": { cellSize: 13.3, anchorX: 9, anchorY: 7 },
        "20_10": { cellSize: 12, anchorX: 9, anchorY: 7 },
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
        // 5) Sharpen toggle
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

        const fineLabel = document.createElement('label');
        fineLabel.htmlFor = 'chk-fine';
        fineLabel.textContent = 'Enable fine-tune controls';
        fineDiv.appendChild(fineChk);
        fineDiv.appendChild(fineLabel);

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
        render();
        setInterval(updateROI, 1000); // update ROI once per second
    });

})();
