// ==UserScript==
// @name         Twitch Nonogram Grid (v1.7)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Nonogram overlay for Twitch with dynamic sizing based on puzzle size, clue counts, and scale factor. Configs can be cycled, saved, loaded, and deleted. Two extra buttons let you adjust the number of clues (row+column) at the top‑right of the grid. Cell size auto‑calculates based on available space, puzzle size, clue counts, and an optional multiplier for smaller windows.
// @author       mr_pantera666, Menels and even more chatGPT
// @match        https://www.twitch.tv/goki*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://menels10.github.io/nonogram-twitch-overlay/twitch-nonogram.user.js
// ==/UserScript==

(function () {
    'use strict';

    // persisted configs
    let configs = JSON.parse(localStorage.getItem('nonogramConfigs')) || {};
    let currentConfigName = 'default';
    let currentConfig = configs[currentConfigName] || {
        size:        4,     // puzzle size
        gridX:      340,    // px from window’s right edge
        gridY:      240,    // px from window’s bottom edge
        clueCount:   1,     // number of clues
        multiplier: 0.421   // the scale you’re already using
    };
    let { size, gridX, gridY, clueCount, multiplier } = currentConfig;

    // state
    let isDragging = false,
        offsetX, offsetY,
        previousBlackCells = new Set();

    // UI elements
    let nextSizeBtn, prevSizeBtn,
        nextClueBtn, prevClueBtn,
        clueBtnContainer, buttonContainer, configPanel;

    // save configs
    function saveConfig(name) {
        configs[name] = { size, gridX, gridY, clueCount, multiplier };
        localStorage.setItem('nonogramConfigs', JSON.stringify(configs));
        populateConfigDropdown();
    }

    function deleteConfig(name) {
        delete configs[name];
        localStorage.setItem('nonogramConfigs', JSON.stringify(configs));
        populateConfigDropdown();
        if (name === currentConfigName) {
            let keys = Object.keys(configs);
            if (keys.length) loadConfig(keys[0]);
            else {
                localStorage.removeItem('nonogramConfigs');
                location.reload();
            }
        }
    }

    function loadConfig(name) {
        currentConfigName = name;
        let c = configs[name];
        ({ size, gridX, gridY, clueCount, multiplier } = c);
        createGrid();
        updateButtonPositions();
        updateClueButtonPositions();
    }

    function populateConfigDropdown() {
        let sel = document.getElementById('configList');
        if (!sel) return;
        sel.innerHTML = '';
        for (let k of Object.keys(configs)) {
            let o = document.createElement('option');
            o.value = k;
            o.textContent = k;
            sel.appendChild(o);
        }
        sel.value = currentConfigName;
    }


    // grid creation
    function createGrid() {
        // remove old grid
        let old = document.getElementById('nonogram-grid');
        if (old) old.remove();

        // auto‑compute cellSize based on window & clueCount & multiplier
        // measure a single clue‐digit ("0") in the current page font
        let meas = document.createElement('span');
        meas.textContent = '0';
        meas.style.position   = 'absolute';
        meas.style.visibility = 'hidden';
        meas.style.padding    = '0';
        meas.style.margin     = '0';
        // if you use a specific font‐size or font‐family for your clues,
        // you can set meas.style.font = '14px sans‑serif' here to match it.
        document.body.appendChild(meas);
        const clueW = meas.getBoundingClientRect().width;
        const clueH = meas.getBoundingClientRect().height;
        document.body.removeChild(meas);

        // now compute exactly like Python:
        let headerSpace = 25;  // extra padding around the clues
        let leftClueW   = clueCount * clueW + headerSpace;
        let topClueH    = clueCount * clueH + headerSpace;

        // and use your real border thickness
        const OUTER_BORDER = 2;
        let margin = 15;
        let availW = window.innerWidth  - leftClueW - 2*margin - OUTER_BORDER*2;
        let availH = window.innerHeight - topClueH  - 2*margin - OUTER_BORDER*2;

        let baseCell  = Math.floor(Math.min(availW / size, availH / size));
        let cellSize  = Math.max(1, Math.floor(baseCell * multiplier));

        // build grid container
        let grid = document.createElement('div');
        grid.id = 'nonogram-grid';
        grid.style.position = 'fixed';
        grid.style.right    = `${gridX}px`;
        grid.style.bottom   = `${gridY}px`;
        grid.style.left     = 'auto';
        grid.style.top      = 'auto';
        grid.style.display  = 'grid';
        grid.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
        grid.style.gridTemplateRows    = `repeat(${size}, ${cellSize}px)`;
        grid.style.border   = '2px solid cyan';
        grid.style.boxSizing = 'border-box';
        grid.style.backgroundColor = 'rgba(255,255,255,0.1)';
        grid.style.cursor   = 'move';
        grid.style.zIndex   = '10000';

        document.body.appendChild(grid);

        // cells
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                let cell = document.createElement('div');
                cell.style.boxSizing = 'border-box';    // ← include border in these dims
                cell.style.width     = `${cellSize}px`;
                cell.style.height    = `${cellSize}px`;
                cell.style.border    = '1px solid rgba(0,255,255,0.3)';
                cell.dataset.row = r;
                cell.dataset.col = c;

                cell.addEventListener('click', () => cell.style.backgroundColor = 'black');
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
        createClueButtons();
        updateButtonPositions();
        updateClueButtonPositions();
    }

    // dragging
function makeDraggable(el) {
    let dragOffsetX, dragOffsetY;

    el.addEventListener('mousedown', e => {
        if (e.target === el) {
            isDragging = true;
            const rect = el.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            el.style.pointerEvents = 'none';
        }
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        // compute the top‑left corner of the grid
        const newLeft = e.clientX - dragOffsetX;
        const newTop  = e.clientY - dragOffsetY;
        const rect    = el.getBoundingClientRect();

        // now compute how far we are from right/bottom edges
        gridX = window.innerWidth  - (newLeft + rect.width);
        gridY = window.innerHeight - (newTop  + rect.height);

        // apply those as right/bottom
        el.style.right  = `${gridX}px`;
        el.style.bottom = `${gridY}px`;
        // clear any left/top overrides
        el.style.left   = 'auto';
        el.style.top    = 'auto';

        updateButtonPositions();
        updateClueButtonPositions();
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        el.style.pointerEvents = 'auto';
    });
}

    // main buttons: export, config, size prev/next
    function createMainButtons() {
        if (buttonContainer) buttonContainer.remove();
        buttonContainer = document.createElement('div');
        buttonContainer.id = 'button-container';
        Object.assign(buttonContainer.style, {
            position: 'fixed', zIndex: '10001', display: 'flex', gap: '4px'
        });
        document.body.appendChild(buttonContainer);

        const btn = (id, text, cb) => {
            let b = document.createElement('button');
            b.id = id;
            b.textContent = text;
            Object.assign(b.style, {
                padding: '4px 8px', background: '#0056b3', color: 'white',
                border: 'none', borderRadius: '3px', cursor: 'pointer'
            });
            b.addEventListener('click', cb);
            buttonContainer.appendChild(b);
            return b;
        };

        btn('export-btn', 'Export ✓', exportBlackCells);
        btn('config-btn', '⚙️', toggleConfigPanel);

        prevSizeBtn = btn('prev-size-btn', `←${size-1}`, () => { size=Math.max(1,size-1); saveConfig(currentConfigName); createGrid(); });
        nextSizeBtn = btn('next-size-btn', `${size+1}→`, () => { size=size+1; saveConfig(currentConfigName); createGrid(); });

        createConfigPanel();
    }

    function updateButtonPositions() {
        const rect = document
        .getElementById('nonogram-grid')
        .getBoundingClientRect();
        buttonContainer.style.left = `${rect.left}px`;
        buttonContainer.style.top  = `${rect.bottom + 8}px`;
        prevSizeBtn.textContent     = `${size > 1 ? size - 1 : 1}`;
        nextSizeBtn.textContent     = `${size + 1}`;
    }

    // clue buttons: top‑right outside grid
    function createClueButtons() {
        if (clueBtnContainer) clueBtnContainer.remove();
        clueBtnContainer = document.createElement('div');
        clueBtnContainer.id = 'clue-button-container';
        Object.assign(clueBtnContainer.style, {
            position: 'fixed', zIndex: '10001', display: 'flex', gap: '4px'
        });
        document.body.appendChild(clueBtnContainer);

        const cb = (id, cb) => {
            let b = document.createElement('button');
            b.id = id;
            Object.assign(b.style, {
                padding: '4px 6px', background: '#007BFF', color: 'white',
                border: 'none', borderRadius: '3px', cursor: 'pointer'
            });
            b.addEventListener('click', cb);
            clueBtnContainer.appendChild(b);
            return b;
        };

        prevClueBtn = cb('prev-clue-btn', () => { clueCount = Math.max(1, clueCount-1); saveConfig(currentConfigName); createGrid(); });
        nextClueBtn = cb('next-clue-btn', () => { clueCount = clueCount+1; saveConfig(currentConfigName); createGrid(); });

        updateClueButtonLabels();
    }

    function updateClueButtonPositions() {
        const rect = document
        .getElementById('nonogram-grid')
        .getBoundingClientRect();
        clueBtnContainer.style.left = `${rect.right + 8}px`;
        clueBtnContainer.style.top  = `${rect.top}px`;
        updateClueButtonLabels();
    }

    function updateClueButtonLabels() {
        prevClueBtn.textContent = `Clues– ${clueCount}`;
        nextClueBtn.textContent = `${clueCount} –Clues+`;
    }

    // export black cells
    function exportBlackCells() {
        let grid = document.getElementById('nonogram-grid');
        if (!grid) return;
        let black = [];
        for (let cell of grid.children) {
            if (cell.style.backgroundColor === 'black') {
                let r = +cell.dataset.row + 1;
                let c = String.fromCharCode(97 + (+cell.dataset.col));
                black.push(`${c}${r}`);
            }
        }
        if (!black.length) return;
        navigator.clipboard.writeText(`!fill ${black.join(' ')}`);
    }

    // config panel
    function createConfigPanel() {
        if (configPanel) return;
        configPanel = document.createElement('div');
        configPanel.id = 'config-panel';
        Object.assign(configPanel.style, {
            position: 'fixed', top:'10px', left:'10px',
            background:'#fff', color:'#000', padding:'8px',
            border:'1px solid #000', zIndex:'10002', display:'none'
        });
        configPanel.innerHTML = `
            <label>Size: <input id="cfg-size" type="number" value="${size}" min="1"/></label><br/>
            <label>Clues: <input id="cfg-clues" type="number" value="${clueCount}" min="1"/></label><br/>
            <label>Scale: <input id="cfg-mult" type="number" step="0.1" value="${multiplier}" min="0.1"/></label><br/>
            <label>Save As: <input id="cfg-name" type="text" placeholder="name"/></label><br/>
            <label>Load: <select id="configList"></select></label><br/>
            <button id="apply-btn">Apply</button>
            <button id="save-btn">Save</button>
            <button id="load-btn">Load</button>
            <button id="del-btn">Delete</button>
        `;
        document.body.appendChild(configPanel);
        populateConfigDropdown();

        document.getElementById('apply-btn').onclick = () => {
            size       = +document.getElementById('cfg-size').value;
            clueCount  = +document.getElementById('cfg-clues').value;
            multiplier = +document.getElementById('cfg-mult').value;
            currentConfigName = document.getElementById('configList').value || currentConfigName;
            saveConfig(currentConfigName);
            createGrid();
        };
        document.getElementById('save-btn').onclick = () => {
            let name = document.getElementById('cfg-name').value.trim() || prompt('Config name?');
            if (!name) return;
            saveConfig(name);
        };
        document.getElementById('load-btn').onclick = () => {
            let name = document.getElementById('configList').value;
            if (!name) return;
            loadConfig(name);
        };
        document.getElementById('del-btn').onclick = () => {
            let name = document.getElementById('configList').value;
            if (name && confirm(`Delete config "${name}"?`)) deleteConfig(name);
        };
    }

    function toggleConfigPanel() {
        configPanel.style.display =
            configPanel.style.display === 'none' ? 'block' : 'none';
    }

    // init
    window.addEventListener('load', () => {
        createGrid();
    });

})();
