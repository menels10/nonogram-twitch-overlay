// ==UserScript==
// @name         Twitch Nonogram Grid with canvas 3.0 (fixed)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Nonogram canvas grid with draggable + ROI support on Twitch stream
// @author       You
// @match        https://www.twitch.tv/goki*
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
    let lastExported = new Set(), cellStates = [];
    const cellSizeTable = {
        "4_1_11_11": 90.47, "4_2_11_11": 85.2,
        "5_1_11_11": 72.19, "5_2_11_11": 68.35, "5_3_11_11": 64.35,
        "6_1_11_11": 60.32, "6_2_11_11": 57.12, "6_3_11_11": 52.0,
        "7_1_11_11": 51.57, "7_2_11_11": 48.96, "7_3_11_11": 46.29, "7_4_11_11": 43.68,
        "8_1_11_11": 45.24, "8_2_11_11": 43.04, "8_3_11_11": 40.75, "8_4_11_11": 38.59,
        "9_1_10_10": 40.42, "9_2_10_10": 38.55, "9_3_10_10": 36.61, "9_4_10_10": 34.74, "9_5_10_10": 32.81,
        "10_1_10_10": 36.48, "10_2_10_10": 34.69, "10_3_10_10": 33.03, "10_4_10_10": 31.27, "10_5_10_10": 28.09,
        "11_1_10_10": 33.16, "11_2_10_10": 31.54, "11_3_10_10": 30.14, "11_4_10_10": 28.70,
        "11_5_10_10": 27.12, "11_6_10_10": 25.53,
        "12_1_10_10": 30.4, "12_2_10_10": 29.07, "12_3_10_10": 27.63, "12_4_10_10": 25.07,
        "12_5_10_10": 24.86, "12_6_10_10": 23.5,
        "13_1_10_10": 28.06, "13_2_10_10": 26.96, "13_3_10_10": 25.67, "13_4_10_10": 24.45,
        "13_5_10_10": 23.24, "13_6_10_10": 22.05, "13_7_10_10": 20.82,
        "14_1_10_10": 26.13, "14_2_10_10": 24.96, "14_3_10_10": 23.84, "14_4_10_10": 22.68,
        "14_5_10_10": 21.58, "14_6_10_10": 20.39, "14_7_10_10": 19.28,
        "15_1_10_10": 24.38, "15_2_10_10": 23.43, "15_3_10_10": 22.39, "15_4_10_10": 21.36,
        "15_5_10_10": 20.32, "15_6_10_10": 19.35, "15_7_10_10": 18.31, "15_8_10_10": 17.27,
        "16_1_10_10": 22.92, "16_2_10_10": 22.03, "16_3_10_10": 21.13, "16_4_10_10": 20.21,
        "16_5_10_10": 19.29, "16_6_10_10": 18.36, "16_7_10_10": 17.43, "16_8_10_10": 16.52,
        "17_1_10_10": 21.57, "17_2_10_10": 20.73, "17_3_10_10": 19.88, "17_4_10_10": 19.02,
        "17_5_10_10": 18.15, "17_6_10_10": 17.28, "17_7_10_10": 16.4, "17_8_10_10": 15.54,
        "17_9_10_10": 14.76,
        "18_1_10_10": 20.42, "18_2_10_10": 19.64, "18_3_10_10": 18.89, "18_4_10_10": 18.13,
        "18_5_10_10": 17.36, "18_6_10_10": 16.52, "18_7_10_10": 15.75, "18_8_10_10": 14.97,
        "18_9_10_10": 14.26,
        "19_1_10_10": 19.35, "19_2_10_10": 18.68, "19_3_10_10": 18.02, "19_4_10_10": 17.29,
        "19_5_10_10": 16.6, "19_6_10_10": 15.9, "19_7_10_10": 15.21, "19_8_10_10": 14.46,
        "19_9_10_10": 13.74, "19_10_10_10": 13.07,
        "20_1_10_10": 18.43, "20_2_10_10": 17.75, "20_3_10_10": 17.12, "20_4_10_10": 16.43,
        "20_5_10_10": 15.77, "20_6_10_10": 15.1, "20_7_10_10": 14.45, "20_8_10_10": 13.74,
        "20_9_10_10": 13.12, "20_10_10_10": 12.42
    };

    function getKey(sz, rc, cc) {
        return `${sz}x${rc}x${cc}`;
    }

    function saveLayout() {
        const key = getKey(size, rowClueCount, colClueCount);
        configs[key] = { ratio, anchorX, anchorY, fineTune, size, rowClueCount, colClueCount };
        localStorage.setItem('nonogramConfigMap', JSON.stringify(configs));
    }
    function loadLayout() {
        const key = getKey(size, rowClueCount, colClueCount);
        const saved = configs[key];
        if (saved) {
            ratio = saved.ratio ?? ratio;
            fineTune = saved.fineTune ?? fineTune;
            anchorX = saved.anchorX ?? anchorX;
            anchorY = saved.anchorY ?? anchorY;
        }
    }
    function initCells() {
        cellStates = Array.from({ length: size }, () => Array(size).fill(0));
        lastExported = new Set(); // ← This is the fix
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
    function disableShrinks() {
        // Placeholder: define this if needed later
    }
    function createGrid() {
        const cw = canvas.width, ch = canvas.height;
        ctx.font = `bold 30px Arial`;
        const clueW = ctx.measureText('0'.repeat(rowClueCount)).width;
        const clueH = 30 * colClueCount + 5;
        const gridSize = Math.min(cw - clueW, ch - clueH);
        const key = `${size}_${colClueCount}_${anchorX}_${anchorY}`;
        let cellSize = cellSizeTable[key];
        if (cellSize === undefined) {
            console.warn(`Missing cell size for key: ${key}, falling back to default formula`);
            const gridSize = Math.min(cw - clueW, ch - clueH);
            cellSize = (gridSize + fineTune) / size;
        } else {
            cellSize = (cellSize * size + fineTune) / size;
        }

        const ox = cw - cellSize * size - anchorX;
        const oy = ch - cellSize * size - anchorY;

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
        if (!video || video.readyState < 2) return;

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
    }

    function updateCanvasSize() {
        const video = document.querySelector('video');
        if (!video || video.readyState < 2) return;

        const roiWidth = video.videoWidth * roiWidthPercent;
        const roiHeight = video.videoHeight * roiHeightPercent;
        canvas.width = roiWidth;
        canvas.height = roiHeight;

        canvas.style.width = `${roiWidth * zoomFactor}px`;
        canvas.style.height = `${roiHeight * zoomFactor}px`;
        frame.style.width = `${roiWidth * zoomFactor}px`;
        frame.style.height = `${roiHeight * zoomFactor + 40}px`;

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

        canvas.addEventListener('mousedown', (e) => {
            e.preventDefault(); // prevent selecting text or opening context menu

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            const clueW = ctx.measureText('0'.repeat(rowClueCount)).width;
            const clueH = 30 * colClueCount + 5;
            const gridSize = Math.min(canvas.width - clueW, canvas.height - clueH);
            const cellSize = (gridSize + fineTune) * ratio / size;
            const ox = canvas.width - cellSize * size - anchorX;
            const oy = canvas.height - cellSize * size - anchorY;
            const c = Math.floor((x - ox) / cellSize);
            const r = Math.floor((y - oy) / cellSize);

            if (r >= 0 && r < size && c >= 0 && c < size) {
                if (e.button === 0) {
                    // Left click
                    cellStates[r][c] = cellStates[r][c] === 1 ? 0 : 1;
                } else if (e.button === 2) {
                    // Right click
                    cellStates[r][c] = cellStates[r][c] === 2 ? 0 : 2;
                }
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
    container.appendChild(makeBtn('Export ✓', exportCells));
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
            <label>Row Clues: <input id="cfg-rows" type="number" value="${rowClueCount}" /></label><br/>
            <label>Col Clues: <input id="cfg-cols" type="number" value="${colClueCount}" /></label><br/>
            <label>Fine Tune: <input id="cfg-fine" type="number" value="${fineTune}" /></label><br/>
            <label>Anchor X: <input id="cfg-anchorX" type="number" value="${anchorX}" /></label><br/>
            <label>Anchor Y: <input id="cfg-anchorY" type="number" value="${anchorY}" /></label><br/>
            <label>Zoom: <input id="cfg-zoom" type="number" value="${zoomFactor}" step="0.1" /></label><br/>
            <button id="cfg-apply">Apply</button>
            <button id="cfg-close">Close</button>
        `;
        document.body.appendChild(panel);

        panel.querySelector('#cfg-apply').onclick = () => {
            size = +panel.querySelector('#cfg-size').value;
            rowClueCount = +panel.querySelector('#cfg-rows').value;
            colClueCount = +panel.querySelector('#cfg-cols').value;
            ratio = +panel.querySelector('#cfg-ratio').value;
            fineTune = +panel.querySelector('#cfg-fine').value;
            anchorX = +panel.querySelector('#cfg-anchorX').value;
            anchorY = +panel.querySelector('#cfg-anchorY').value;
            zoomFactor = +panel.querySelector('#cfg-zoom').value;
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
            key: 'rows', label: 'Row clues',
            get: () => rowClueCount,
            dec: () => { disableShrinks(); rowClueCount = Math.max(1, rowClueCount - 1); loadLayout(); initCells(); updateCanvasSize(); updateAllLabels(); },
            inc: () => { disableShrinks(); rowClueCount++; loadLayout(); initCells(); updateCanvasSize(); updateAllLabels(); }
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
