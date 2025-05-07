// ==UserScript==
// @name         Twitch Nonogram mobile 0 Not functional yet.
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Nonogram canvas grid to play nonogram's on Goki channel
// @author       mrpantera+menels+a lot of chatgpt
// @match        https://m.twitch.tv/goki*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_CONF = { anchorX: 10, anchorY: 10, zoomFactor: 1.3, fineTune: 0 };
    let size = 4, rowClueCount = 1, colClueCount = 1, ratio = 1.0;
    let anchorX = DEFAULT_CONF.anchorX, anchorY = DEFAULT_CONF.anchorY;
    let zoomFactor = DEFAULT_CONF.zoomFactor, fineTune = DEFAULT_CONF.fineTune;
    let roiWidthPercent = 0.335, roiHeightPercent = 0.584;
    let aspectRatio = 800 / 630;
    let configs = JSON.parse(localStorage.getItem('nonogramConfigMap')) || {};
    let canvas, ctx, frame, isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
    let lastExported = new Set(), lastExportedWhite = new Set(), cellStates = [];


    const sizeLookup = {
        "4_1": { cellSize: 90.47, anchorX: 11, anchorY: 11 },
        "4_2": { cellSize: 85.2, anchorX: 11, anchorY: 11 },
        "5_1": { cellSize: 72.19, anchorX: 11, anchorY: 11 },
        "5_2": { cellSize: 68.35, anchorX: 11, anchorY: 11 },
        "5_3": { cellSize: 64.35, anchorX: 11, anchorY: 11 },
        "6_1": { cellSize: 60.32, anchorX: 11, anchorY: 11 },
        "6_2": { cellSize: 57.12, anchorX: 11, anchorY: 11 },
        "6_3": { cellSize: 54.0, anchorX: 11, anchorY: 11 },
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
        "10_5": { cellSize: 28.09, anchorX: 10, anchorY: 10 },
        "11_1": { cellSize: 33.16, anchorX: 10, anchorY: 10 },
        "11_2": { cellSize: 31.54, anchorX: 10, anchorY: 10 },
        "11_3": { cellSize: 30.14, anchorX: 10, anchorY: 10 },
        "11_4": { cellSize: 28.7, anchorX: 10, anchorY: 10 },
        "11_5": { cellSize: 27.12, anchorX: 10, anchorY: 10 },
        "11_6": { cellSize: 25.53, anchorX: 10, anchorY: 10 },
        "12_1": { cellSize: 30.4, anchorX: 10, anchorY: 10 },
        "12_2": { cellSize: 29.07, anchorX: 10, anchorY: 10 },
        "12_3": { cellSize: 27.63, anchorX: 10, anchorY: 10 },
        "12_4": { cellSize: 25.07, anchorX: 10, anchorY: 10 },
        "12_5": { cellSize: 24.86, anchorX: 10, anchorY: 10 },
        "12_6": { cellSize: 23.5, anchorX: 10, anchorY: 10 },
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
        "17_7": { cellSize: 16.4, anchorX: 10, anchorY: 10 },
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
        "19_5": { cellSize: 16.6, anchorX: 10, anchorY: 10 },
        "19_6": { cellSize: 15.9, anchorX: 10, anchorY: 10 },
        "19_7": { cellSize: 15.21, anchorX: 10, anchorY: 10 },
        "19_8": { cellSize: 14.46, anchorX: 10, anchorY: 10 },
        "19_9": { cellSize: 13.74, anchorX: 10, anchorY: 10 },
        "19_10": { cellSize: 13.07, anchorX: 10, anchorY: 10 },
        "20_1": { cellSize: 18.43, anchorX: 10, anchorY: 10 },
        "20_2": { cellSize: 17.75, anchorX: 10, anchorY: 10 },
        "20_3": { cellSize: 17.12, anchorX: 10, anchorY: 10 },
        "20_4": { cellSize: 16.43, anchorX: 10, anchorY: 10 },
        "20_5": { cellSize: 15.77, anchorX: 10, anchorY: 10 },
        "20_6": { cellSize: 15.1, anchorX: 10, anchorY: 10 },
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
        lastExported = new Set(); // ← This is the fix
        lastExportedWhite = new Set();
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

    function disableShrinks() {
        // Placeholder: define this if needed later
    }
    function createGrid() {
        const cw = canvas.width, ch = canvas.height;
        ctx.font = `bold 30px Arial`;
        const clueW = ctx.measureText('0'.repeat(rowClueCount)).width;
        const clueH = 30 * colClueCount + 5;
        const gridSize = Math.min(cw - clueW, ch - clueH);
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
        console.log(`Drawing grid: size=${size}, colClues=${colClueCount}, cellSize=${cellSize.toFixed(2)}, anchorX=${anchorX}, anchorY=${anchorY}`);
        // console.log(`Canvas size: width=${canvas.width}, height=${canvas.height}`);

        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 1;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const x = ox + c * cellSize;
                const y = oy + r * cellSize;
                ctx.strokeRect(x, y, cellSize, cellSize);
                if (cellStates[r][c] === 1) {
                    ctx.fillRect(x, y, cellSize, cellSize);
                } else if (cellStates[r][c] === 2) {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(x, y, cellSize, cellSize);
                    ctx.fillStyle = 'black';
                }
            }
        }
    }

    function drawROI() {
        const videos = document.querySelectorAll('video');
        let video = null;
        for (let vi = videos.length - 1; vi >= 0; vi--) {
            if (videos[vi].readyState >= 2) {
                video = videos[vi];
                break;
            }
        }

        if (!video) return;

        // ⛔ Some mobile browsers need CORS
        try {
            const roiWidth = video.videoWidth * roiWidthPercent;
            const roiHeight = video.videoHeight * roiHeightPercent;
            const roiX = video.videoWidth - roiWidth;
            const roiY = video.videoHeight - roiHeight;

            if (roiWidth <= 0 || roiHeight <= 0) return;

            const canvasAspect = canvas.width / canvas.height;
            aspectRatio = roiWidth / roiHeight;
            let drawWidth = canvas.width, drawHeight = canvas.height, dx = 0, dy = 0;

            if (canvasAspect > aspectRatio) {
                drawHeight = canvas.height;
                drawWidth = drawHeight * aspectRatio;
                dx = (canvas.width - drawWidth) / 2;
            } else {
                drawWidth = canvas.width;
                drawHeight = drawWidth / aspectRatio;
                dy = (canvas.height - drawHeight) / 2;
            }

            ctx.drawImage(video, roiX, roiY, roiWidth, roiHeight, dx, dy, drawWidth, drawHeight);
        } catch (err) {
            console.warn('Could not draw video on canvas (possibly due to CORS or mobile browser limits):', err);
        }
    }


    function updateCanvasSize() {
        // 🔒 Fixed dimensions based on 720p stream expectations
        const fixedWidth = 428;
        const fixedHeight = 420;

        canvas.width = fixedWidth;
        canvas.height = fixedHeight;


        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // Optionally reduce zoom if screen is small
        if (screenWidth < 600) {
            zoomFactor = 0.9;
        } else if (screenWidth < 400) {
            zoomFactor = 0.7;
        }
        canvas.style.width = `${fixedWidth * zoomFactor}px`;
        canvas.style.height = `${fixedHeight * zoomFactor}px`;
        frame.style.width = `${fixedWidth * zoomFactor}px`;
        frame.style.height = `${fixedHeight * zoomFactor + 40}px`;
        createGrid();
        drawROI();
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawROI();
        createGrid();
        requestAnimationFrame(render);
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

        frame.addEventListener('mousedown', (e) => {
            // Allow dragging even when clicking on the canvas
            isDragging = true;
            dragOffsetX = e.clientX - frame.offsetLeft;
            dragOffsetY = e.clientY - frame.offsetTop;
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                frame.style.left = `${e.clientX - dragOffsetX}px`;
                frame.style.top = `${e.clientY - dragOffsetY}px`;
            }
        });
        document.addEventListener('mouseup', () => isDragging = false);

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling or zooming

            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (touch.clientX - rect.left) * scaleX;
            const y = (touch.clientY - rect.top) * scaleY;

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
                // Cycle: 0 → 1 (black) → 2 (white) → 0
                cellStates[r][c] = (cellStates[r][c] + 1) % 3;
            }
        });

        // ⚡ Separate from the above!
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});}
function createMainButtons() {
    const container = document.createElement('div');
    container.id = 'button-container';
    container.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
        z-index: 10001;
        pointer-events: auto;
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

    // Export and config buttons
    container.appendChild(makeBtn('Export black', exportCells));
    container.appendChild(makeBtn('Export white', exportWhiteCells));
    container.appendChild(makeBtn('⚙️', toggleConfigPanel));

    // Grouped zoom buttons
    const zoomGroup = document.createElement('div');
    zoomGroup.style.cssText = `
        display: flex;
        gap: 4px;
        border: 1px solid #000;
        border-radius: 3px;
        padding: 2px 4px;
        background: transparent;
    `;

    zoomGroup.appendChild(makeBtn('−', () => {
        zoomFactor = Math.max(0.1, zoomFactor * 0.9);
        updateCanvasSize();
    }));

    zoomGroup.appendChild(makeBtn('+', () => {
        zoomFactor = zoomFactor * 1.1;
        updateCanvasSize();
    }));

    zoomGroup.appendChild(makeBtn('1×', () => {
        zoomFactor = 1.0;
        updateCanvasSize();
    }));

    container.appendChild(zoomGroup);
}



    function createConfigPanel() {
        if (document.getElementById('config-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'config-panel';
        panel.style.cssText = `
    position: absolute;
    top: calc(100% + 8px);  /* 8px below the bottom edge of the frame */
    left: 0;
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
            ratio = +panel.querySelector('#cfg-ratio').value;
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
    function updateAllLabels() {
        Object.entries(labelMap).forEach(([k, lbl]) => {
            const section = controlSections.find(s => s.key === k);
            if (section) lbl.textContent = `${section.label}: ${section.get()}`;
        });
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

    frame.appendChild(controlContainer); // Attach to the draggable canvas wrapper

    // 🔄 Move these to global if used elsewhere, or keep here if local
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

    // ✅ This now works because `controlSections` is properly defined
    controlSections.forEach((s, i) => {
        const sec = document.createElement('div');
        sec.id = `section-${s.key}`;

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
}
    function toggleConfigPanel() {
        const panel = document.getElementById('config-panel');
        if (!panel) return;
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    window.addEventListener('load', () => {
        setupCanvas();
        initCells();
        updateCanvasSize();
        createMainButtons();
        createConfigPanel();
        createControlPanel();
        render();
    });
})();
