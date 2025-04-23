// ==UserScript==
// @name         Twitch Nonogram Grid (v1.8) – Python Logic + Ratio Only + Auto-Persist per Layout + Config UI + Fine Tune + Toggle Controls + Import/Export Configs + Reset Size/Clues
// @namespace    http://tampermonkey.net/
// @version      1.19.4
// @description  Uses Python `render_nonogram` logic with ratio scaling, per-layout persistence, full config panel, per-cellSize fine tuning, toggleable scale/fine controls, import/export of configs, and reset-to-4×1×1 controls, with blue buttons aligned properly.
// @author       mr_pantera666, Menels and a LOT of chatGPT
 // @match        https://www.twitch.tv/goki*
 // @grant        none
 // @run-at       document-idle
 // @downloadURL  https://menels10.github.io/nonogram-twitch-overlay/twitch-nonogram.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Default config values
    const DEFAULT_CONF = { ratio: 0.5, gridX: 340, gridY: 240, fineTune: 0 };

    // Stored per-layout configs
    let configs = JSON.parse(localStorage.getItem('nonogramConfigMap')) || {};

    // Current grid parameters
    let size = 5, rowClueCount = 2, colClueCount = 2;
    let ratio = DEFAULT_CONF.ratio;
    let gridX = DEFAULT_CONF.gridX, gridY = DEFAULT_CONF.gridY;
    let fineTune = DEFAULT_CONF.fineTune;

    // UI containers
    let buttonContainer, controlContainer, configPanel;
    let isDragging = false;
    let lastExported = new Set();

    function getKey(sz, rc, cc) { return `${sz}x${rc}x${cc}`; }

    function loadLayout() {
        const key = getKey(size, rowClueCount, colClueCount);
        const saved = configs[key];
        if (saved) {
            ratio    = saved.ratio    ?? ratio;
            fineTune = saved.fineTune ?? fineTune;
            gridX    = saved.gridX    ?? gridX;
            gridY    = saved.gridY    ?? gridY;
        }
    }

    function saveLayout() {
        const key = getKey(size, rowClueCount, colClueCount);
        configs[key] = { ratio, gridX, gridY, fineTune, size, rowClueCount, colClueCount };
        localStorage.setItem('nonogramConfigMap', JSON.stringify(configs));
    }

    function createGrid() {
        // — RESET THE EXPORT CACHE ON EVERY GRID REBUILD —
        lastExported.clear();
        document.getElementById('nonogram-grid')?.remove();
        buttonContainer?.remove();
        controlContainer?.remove();
        loadLayout();

        // sizing logic...
        const max_bg_w = 800, max_bg_h = 630, margin = 15, header_space = 25;
        const t = (size - 4) / (20 - 4);
        const hintFontSize = Math.floor(44 + (30 - 44) * t);
        const hintFont = `bold ${hintFontSize}px Arial`;
        const span = document.createElement('span');
        Object.assign(span.style, { position: 'absolute', visibility: 'hidden', font: hintFont });
        span.textContent = '0'; document.body.appendChild(span);
        const clueW = span.getBoundingClientRect().width; document.body.removeChild(span);
        const clueHMap = {4:44,5:43,6:42,7:41,8:40,9:39,10:38,11:37,12:37,13:36,14:35,15:34,16:33,17:32,18:31,19:30,20:30};
        const clueH = clueHMap[size] ?? hintFontSize;
        const rowHintW = rowClueCount * clueW + (rowClueCount - 1) * clueW * 0.5 + header_space;
        const colHintH = colClueCount * clueH + header_space;
        const availW = max_bg_w - 2 * margin - rowHintW;
        const availH = max_bg_h - 2 * margin - colHintH;
        const gridSize = Math.min(availW, availH);
        const baseCell = (gridSize + fineTune) * ratio / size;
        const cellSize = baseCell;

        const grid = document.createElement('div');
        grid.id = 'nonogram-grid';
        Object.assign(grid.style, {
            position: 'fixed',
            right:    `${gridX}px`,
            bottom:   `${gridY}px`,
            display:  'grid',
            gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
            gridTemplateRows:    `repeat(${size}, ${cellSize}px)`,
            border:   '2px solid cyan',
            backgroundColor: 'rgba(255,255,255,0.1)',
            cursor:   'move',
            zIndex:   '10000'
        });
        document.body.appendChild(grid);

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const cell = document.createElement('div');
                Object.assign(cell.style, {
                    boxSizing: 'content-box',
                    width:     `${cellSize - 2}px`,
                    height:    `${cellSize - 2}px`,
                    border:    '1px solid rgba(0,255,255,0.3)'
                });
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.addEventListener('click', () => {
                    const isBlack = cell.style.backgroundColor === 'black';
                    cell.style.backgroundColor = isBlack ? 'transparent' : 'black';
                });
                cell.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    cell.style.backgroundColor =
                        cell.style.backgroundColor === 'white' ? 'transparent' : 'white';
                });
                grid.appendChild(cell);
            }
        }

        makeDraggable(grid);
        createMainButtons();
        createControlPanel();
        createConfigPanel();
        updateControlPositions();
    }

    function makeDraggable(el) {
        let dx, dy;
        el.addEventListener('mousedown', e => {
            if (e.target === el) {
                isDragging = true;
                const rect = el.getBoundingClientRect();
                dx = e.clientX - rect.left;
                dy = e.clientY - rect.top;
                el.style.pointerEvents = 'none';
            }
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const newLeft = e.clientX - dx, newTop = e.clientY - dy;
            const rect = el.getBoundingClientRect();
            gridX = window.innerWidth  - (newLeft + rect.width);
            gridY = window.innerHeight - (newTop  + rect.height);
            el.style.right  = `${gridX}px`;
            el.style.bottom = `${gridY}px`;
            updateControlPositions();
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) saveLayout();
            isDragging = false;
            el.style.pointerEvents = 'auto';
        });
    }

    function createMainButtons() {
        buttonContainer = document.createElement('div');
        buttonContainer.id = 'button-container';
        Object.assign(buttonContainer.style, {
            position: 'fixed',
            zIndex:   '10001',
            display:  'flex',
            gap:      '4px',
            color:    'black'
        });
        document.body.appendChild(buttonContainer);

        [
            { id: 'export-btn', text: 'Export ✓', cb: exportBlackCells },
            { id: 'config-btn', text: '⚙️',       cb: toggleConfigPanel }
        ].forEach(bd => {
            const btn = document.createElement('button');
            btn.id          = bd.id;
            btn.textContent = bd.text;
            Object.assign(btn.style, {
                padding:       '4px 8px',
                background:    '#fff',
                border:        '1px solid #000',
                borderRadius:  '3px',
                cursor:        'pointer',
                color:         'black'
            });
            btn.addEventListener('click', bd.cb);
            buttonContainer.appendChild(btn);
        });
    }

    function exportBlackCells() {
        const grid = document.getElementById('nonogram-grid');
        if (!grid) return;
        const newly = [];
        Array.from(grid.children).forEach(cell => {
            if (cell.style.backgroundColor === 'black') {
                const coord = `${String.fromCharCode(97 + +cell.dataset.col)}${+cell.dataset.row + 1}`;
                if (!lastExported.has(coord)) {
                    newly.push(coord);
                    lastExported.add(coord);
                }
            }
        });
        if (newly.length) navigator.clipboard.writeText(`!fill ${newly.join(' ')}`);
    }

    function createControlPanel() {
        controlContainer = document.createElement('div');
        controlContainer.id = 'control-container';
        Object.assign(controlContainer.style, {
            position:     'fixed',
            zIndex:       '10001',
            padding:      '8px',
            background:   '#fff',
            border:       '1px solid #000',
            borderRadius: '4px',
            boxShadow:    '0 2px 6px rgba(0,0,0,0.2)',
            lineHeight:   '1.4em',
            color:        'black'
        });
        document.body.appendChild(controlContainer);

        const sections = [
            {
                key: 'size', label: 'Grid size',
                get: () => size,
                dec: () => { saveLayout(); size = Math.max(1, size - 1); createGrid(); },
                inc: () => { saveLayout(); size++; createGrid(); }
            },
            {
                key: 'rows', label: 'Row clues',
                get: () => rowClueCount,
                dec: () => { saveLayout(); rowClueCount = Math.max(1, rowClueCount - 1); createGrid(); },
                inc: () => { saveLayout(); rowClueCount++; createGrid(); }
            },
            {
                key: 'cols', label: 'Col clues',
                get: () => colClueCount,
                dec: () => { saveLayout(); colClueCount = Math.max(1, colClueCount - 1); createGrid(); },
                inc: () => { saveLayout(); colClueCount++; createGrid(); }
            }
        ];
        const scaleSection = {
            key: 'scale', label: 'Scale',
            get: () => ratio.toFixed(3),
            dec: () => { ratio = Math.max(0.01, +(ratio - 0.01).toFixed(3)); saveLayout(); createGrid(); },
            inc: () => { ratio = +(ratio + 0.01).toFixed(3); saveLayout(); createGrid(); }
        };
        const fineSection = {
            key: 'fine', label: 'Fine tune',
            get: () => fineTune,
            dec: () => { fineTune--; saveLayout(); createGrid(); },
            inc: () => { fineTune++; saveLayout(); createGrid(); }
        };
        const allSections = sections.concat([ scaleSection, fineSection ]);

        allSections.forEach((s, i) => {
            const sec = document.createElement('div');
            sec.id = `section-${s.key}`;
            const lbl = document.createElement('div');
            lbl.textContent = `${s.label}: ${s.get()}`;
            lbl.style.fontWeight = 'bold';
            sec.appendChild(lbl);

            const row = document.createElement('div');
            Object.assign(row.style, {
                display:      'flex',
                gap:          '4px',
                marginBottom: '8px',
                alignItems:   'center'
            });
            // for size row, let it span panel width so spacer works
            if (s.key === 'size') {
                row.style.width = '100%';
            }
            sec.appendChild(row);

            // create – and + buttons
            [['–', s.dec], ['+', s.inc]].forEach(([sym, fn]) => {
                const btn = document.createElement('button');
                btn.textContent = sym;
                Object.assign(btn.style, {
                    width:           '24px',
                    height:          '24px',
                    border:          '1px solid blue',
                    borderRadius:    '3px',
                    fontSize:        '16px',
                    cursor:          'pointer',
                    backgroundColor: 'blue',
                    color:           'white',
                    textAlign:       'center'
                });
                btn.addEventListener('click', fn);
                row.appendChild(btn);
            });

            // if this is the size row, insert spacer then the "4" reset button
            if (s.key === 'size') {
                const spacer = document.createElement('div');
                spacer.style.flex = '1';
                row.appendChild(spacer);

                const btn4 = document.createElement('button');
                btn4.textContent = '4';
                Object.assign(btn4.style, {
                    width:           '24px',
                    height:          '24px',
                    border:          '1px solid blue',
                    borderRadius:    '3px',
                    fontSize:        '16px',
                    cursor:          'pointer',
                    backgroundColor: 'blue',
                    color:           'white',
                    textAlign:       'center'
                });
                btn4.addEventListener('click', () => {
                    saveLayout();
                    size = 4;
                    rowClueCount = 1;
                    colClueCount = 1;
                    createGrid();
                });
                row.appendChild(btn4);
            }

            controlContainer.appendChild(sec);
            if (i < allSections.length - 1) {
                controlContainer.appendChild(document.createElement('hr'));
            }
        });
    }

    function createConfigPanel() {
        if (configPanel) return;
        configPanel = document.createElement('div');
        configPanel.id = 'config-panel';
        Object.assign(configPanel.style, {
            position:     'fixed',
            top:          '10px',
            left:         '10px',
            background:   '#fff',
            padding:      '8px',
            border:       '1px solid #000',
            borderRadius: '4px',
            zIndex:       '10002',
            color:        'black',
            display:      'none'
        });

        configPanel.innerHTML = `
            <label>Size:       <input id="cfg-size" type="number" value="${size}" min="1"/></label><br/>
            <label>Row Clues:  <input id="cfg-rows" type="number" value="${rowClueCount}" min="1"/></label><br/>
            <label>Col Clues:  <input id="cfg-cols" type="number" value="${colClueCount}" min="1"/></label><br/>
            <label>Scale:      <input id="cfg-ratio" type="number" step="0.01" value="${ratio}" min="0.01"/></label><br/>
            <label>Fine Tune:  <input id="cfg-fine" type="number" step="1" value="${fineTune}"/></label><br/>
            <label><input id="cfg-toggle-controls" type="checkbox" checked/> Show Scale & Fine Controls</label><br/><br/>
            <button id="export-configs-btn">Export Configs</button>
            <button id="import-configs-btn">Import Configs</button>
            <input type="file" id="import-configs-file" accept="application/json" style="display:none"/><br/><br/>
            <button id="apply-btn">Apply</button>
        `;
        document.body.appendChild(configPanel);

        // toggle scale/fine
        const toggleCheckbox = configPanel.querySelector('#cfg-toggle-controls');
        toggleCheckbox.addEventListener('change', () => {
            const display = toggleCheckbox.checked ? 'block' : 'none';
            ['scale', 'fine'].forEach(key => {
                const sec = document.getElementById(`section-${key}`);
                if (sec) sec.style.display = display;
            });
        });

        // apply
        configPanel.querySelector('#apply-btn').addEventListener('click', () => {
            size          = +configPanel.querySelector('#cfg-size').value;
            rowClueCount  = +configPanel.querySelector('#cfg-rows').value;
            colClueCount  = +configPanel.querySelector('#cfg-cols').value;
            ratio         = parseFloat(configPanel.querySelector('#cfg-ratio').value);
            fineTune      = parseInt(configPanel.querySelector('#cfg-fine').value, 10);
            saveLayout();
            createGrid();
        });

        // export/import logic ...
        configPanel.querySelector('#export-configs-btn').addEventListener('click', () => {
            const data = JSON.stringify(configs, null, 2);
            navigator.clipboard.writeText(data)
                .then(() => alert('Configs JSON copied to clipboard!'))
                .catch(() => alert('Failed to copy configs to clipboard.'));
        });
        configPanel.querySelector('#import-configs-btn').addEventListener('click', () => {
            configPanel.querySelector('#import-configs-file').click();
        });
        configPanel.querySelector('#import-configs-file').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = evt => {
                try {
                    const imported = JSON.parse(evt.target.result);
                    configs = Object.assign({}, configs, imported);
                    localStorage.setItem('nonogramConfigMap', JSON.stringify(configs));
                    alert('Configs imported successfully!');
                    createGrid();
                } catch {
                    alert('Invalid JSON file.');
                }
            };
            reader.readAsText(file);
        });
    }

    function toggleConfigPanel() {
        createConfigPanel();
        configPanel.style.display = configPanel.style.display === 'none' ? 'block' : 'none';
    }

    function updateControlPositions() {
        const g = document.getElementById('nonogram-grid').getBoundingClientRect();
        buttonContainer.style.left = `${g.left}px`;
        buttonContainer.style.top  = `${g.bottom + 8}px`;
        if (controlContainer) {
            controlContainer.style.left = `${g.right + 8}px`;
            controlContainer.style.top  = `${g.top}px`;
        }
    }

    // Unified initializer
    function initNonogram() {
      createGrid();
      createConfigPanel();
    }

    // If page’s already ready, fire now; otherwise wait for load
    if (document.readyState === 'complete' ||
        document.readyState === 'interactive') {
      initNonogram();
    } else {
      window.addEventListener('load', initNonogram);
    }

})();
