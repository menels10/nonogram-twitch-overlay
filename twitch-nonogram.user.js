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


(function() {
    'use strict';

    // Default config
    const DEFAULT_CONF = {
        size:          5,
        gridX:         340,
        gridY:         240,
        rowClueCount:  2,
        colClueCount:  2,
        ratio:         1.0
    };

    // Load stored configs or defaults
    let configs = JSON.parse(localStorage.getItem('nonogramConfigs')) || {};
    let currentConfigName = 'default';
    if (!configs[currentConfigName]) configs[currentConfigName] = DEFAULT_CONF;
    let { size, gridX, gridY, rowClueCount, colClueCount, ratio } = loadConfigValues(configs[currentConfigName]);

    let buttonContainer, controlContainer, configPanel;
    let isDragging = false;

    function loadConfigValues(c) {
        return {
            size:          c.size        ?? DEFAULT_CONF.size,
            gridX:         c.gridX       ?? DEFAULT_CONF.gridX,
            gridY:         c.gridY       ?? DEFAULT_CONF.gridY,
            rowClueCount:  c.rowClueCount?? DEFAULT_CONF.rowClueCount,
            colClueCount:  c.colClueCount?? DEFAULT_CONF.colClueCount,
            ratio:         c.ratio       ?? DEFAULT_CONF.ratio
        };
    }

    function saveConfig(name) {
        configs[name] = { size, gridX, gridY, rowClueCount, colClueCount, ratio };
        localStorage.setItem('nonogramConfigs', JSON.stringify(configs));
        populateConfigDropdown();
    }

    function loadConfig(name) {
        currentConfigName = name;
        ({ size, gridX, gridY, rowClueCount, colClueCount, ratio } = loadConfigValues(configs[name]));
        createGrid();
    }

    function deleteConfig(name) {
        delete configs[name];
        localStorage.setItem('nonogramConfigs', JSON.stringify(configs));
        populateConfigDropdown();
    }

    // Create grid using Python logic + ratio only
    function createGrid() {
        // Remove existing UI
        document.getElementById('nonogram-grid')?.remove();
        buttonContainer?.remove();
        controlContainer?.remove();

        // Constants
        const max_bg_w     = 800;
        const max_bg_h     = 630;
        const margin       = 15;
        const header_space = 25;

        // Factor t
        const t = (size - 4) / (20 - 4);

        // Font sizes
        const headerFontSize = Math.floor(48 + (32 - 48) * t);
        const hintFontSize   = Math.floor(44 + (30 - 44) * t);
        const hintFont       = `bold ${hintFontSize}px Arial`;

                // Measure a single clue digit width
        const span = document.createElement('span');
        Object.assign(span.style, { position:'absolute', visibility:'hidden', font:hintFont, padding:0, margin:0 });
        span.textContent = '0';
        document.body.appendChild(span);
        const clueW = span.getBoundingClientRect().width;
        document.body.removeChild(span);

        // Hardcoded clue heights per size (matches Pygame font metrics)
        const clueHMap = {
            4:44, 5:43, 6:42, 7:41, 8:40, 9:39,
            10:38, 11:37, 12:37, 13:36, 14:35, 15:34,
            16:33, 17:32, 18:31, 19:30, 20:30
        };
        const clueH = clueHMap[size] ?? hintFontSize;

        // Hint band sizes

        const rowHintW = rowClueCount * clueW + (rowClueCount - 1) * clueW * 0.5 + header_space;
        const colHintH = colClueCount * clueH + header_space;


        // Available area
        const availW = max_bg_w - 2 * margin - rowHintW;
        const availH = max_bg_h - 2 * margin - colHintH;

        // Grid and cell size
        const gridSize = Math.min(availW, availH);
        const baseCell = gridSize / size;
        const cellSize = baseCell * ratio;
        // Create grid container
        const grid = document.createElement('div');
        grid.id = 'nonogram-grid';
        Object.assign(grid.style, {
            position:            'fixed',
            right:               `${gridX}px`,
            bottom:              `${gridY}px`,
            display:             'grid',
            gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
            gridTemplateRows:    `repeat(${size}, ${cellSize}px)`,
            border:              '2px solid cyan',
            backgroundColor:     'rgba(255,255,255,0.1)',
            cursor:              'move',
            zIndex:              '10000'
        });
        document.body.appendChild(grid);

        // Populate cells
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const cell = document.createElement('div');
                Object.assign(cell.style, {
                    boxSizing: 'border-box',
                    width:     `${cellSize}px`,
                    height:    `${cellSize}px`,
                    border:    '1px solid rgba(0,255,255,0.3)'
                });
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.addEventListener('click', () => cell.style.backgroundColor = 'black');
                cell.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    cell.style.backgroundColor = cell.style.backgroundColor === 'white' ? 'transparent' : 'white';
                });
                grid.appendChild(cell);
            }
        }

        // Attach controls
        makeDraggable(grid);
        createMainButtons();
        createControlPanel();
        updateControlPositions();
    }

    // Draggable logic
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
            const newLeft = e.clientX - dx;
            const newTop = e.clientY - dy;
            const rect = el.getBoundingClientRect();
            gridX = window.innerWidth - (newLeft + rect.width);
            gridY = window.innerHeight - (newTop + rect.height);
            el.style.right = `${gridX}px`;
            el.style.bottom = `${gridY}px`;
            updateControlPositions();
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
            el.style.pointerEvents = 'auto';
        });
    }

    // Main buttons
    function createMainButtons() {
        buttonContainer = document.createElement('div');
        buttonContainer.id = 'button-container';
        Object.assign(buttonContainer.style, { position:'fixed', zIndex:'10001', display:'flex', gap:'4px' });
        document.body.appendChild(buttonContainer);
        const btns = [
            { id:'export-btn', text:'Export ✓', cb:exportBlackCells },
            { id:'config-btn', text:'⚙️', cb:toggleConfigPanel }
        ];
        btns.forEach(bd => {
            const b = document.createElement('button'); b.id = bd.id; b.textContent = bd.text;
            Object.assign(b.style, { padding:'4px 8px', background:'#0056b3', color:'#fff', border:'none', borderRadius:'3px', cursor:'pointer' });
            b.addEventListener('click', bd.cb);
            buttonContainer.appendChild(b);
        });
    }

    // Export filled cells
    function exportBlackCells() {
        const grid = document.getElementById('nonogram-grid'); if (!grid) return;
        const filled = [];
        Array.from(grid.children).forEach(cell => {
            if (cell.style.backgroundColor === 'black') {
                const r = +cell.dataset.row + 1;
                const c = String.fromCharCode(97 + (+cell.dataset.col));
                filled.push(`${c}${r}`);
            }
        });
        if (filled.length) navigator.clipboard.writeText(`!fill ${filled.join(' ')}`);
    }

    // Control panel UI
    function createControlPanel() {
        controlContainer = document.createElement('div'); controlContainer.id='control-container';
        Object.assign(controlContainer.style, { position:'fixed', zIndex:'10001', padding:'8px', background:'#fff', border:'1px solid #007BFF', borderRadius:'4px', boxShadow:'0 2px 6px rgba(0,0,0,0.2)', lineHeight:'1.4em' });
        document.body.appendChild(controlContainer);
        const sections = [
            { label:'Grid size', get:() => size,        dec:() => size=Math.max(1,size-1), inc:() => size++       },
            { label:'Row clues',get:() => rowClueCount, dec:() => rowClueCount=Math.max(1,rowClueCount-1), inc:() => rowClueCount++ },
            { label:'Col clues',get:() => colClueCount, dec:() => colClueCount=Math.max(1,colClueCount-1), inc:() => colClueCount++ },
            { label: 'Scale', get:    () => ratio.toFixed(3),dec:    () => {ratio = Math.max(0.01, ratio - 0.01); ratio = Math.round(ratio * 1000) / 1000;}, inc:    () => {ratio = ratio + 0.01;ratio = Math.round(ratio * 1000) / 1000;}}
        ];
        sections.forEach((s,i) => {
            const lbl = document.createElement('div'); lbl.textContent = `${s.label}: ${s.get()}`; lbl.style.fontWeight='bold'; lbl.style.color       = 'black';
            controlContainer.appendChild(lbl);
            const row = document.createElement('div'); row.style.display='flex'; row.style.gap='4px'; row.style.marginBottom='8px';
            controlContainer.appendChild(row);
            [['–',s.dec],['+',s.inc]].forEach(([sym,fn]) => {
                const btn = document.createElement('button'); btn.textContent=sym;
                Object.assign(btn.style,{width:'24px',height:'24px',border:'none',borderRadius:'3px',fontSize:'16px',background:'#007BFF',color:'#fff',cursor:'pointer'});
                btn.addEventListener('click',() => { fn(); saveConfig(currentConfigName); createGrid(); });
                row.appendChild(btn);
            });
            if (i<sections.length-1) controlContainer.appendChild(document.createElement('hr'));
        });
    }

    // Config dropdown
    function populateConfigDropdown() {
        if (!configPanel) return;
        const sel = document.getElementById('configList'); sel.innerHTML='';
        Object.keys(configs).forEach(k => { const o=document.createElement('option'); o.value=k; o.textContent=k; sel.appendChild(o); });
        sel.value=currentConfigName;
    }

    // Config panel UI
    function createConfigPanel() {
        if (configPanel) return;
        configPanel = document.createElement('div'); configPanel.id='config-panel';
        Object.assign(configPanel.style,{position:'fixed',top:'10px',left:'10px',background:'#fff',color:'#000',padding:'8px',border:'1px solid #000',zIndex:'10002',display:'none'});
        configPanel.innerHTML = `
            <label>Size:       <input id="cfg-size"       type="number" step="1" value="${size}"         min="1"/></label><br/>
            <label>Row Clues:  <input id="cfg-row-clues" type="number" step="1" value="${rowClueCount}" min="1"/></label><br/>
            <label>Col Clues:  <input id="cfg-col-clues" type="number" step="1" value="${colClueCount}" min="1"/></label><br/>
            <label>Scale:      <input id="cfg-ratio"      type="number" step="0.01" value="${ratio}"      min="0.01"/></label><br/>
            <label>Save As:    <input id="cfg-name"       type="text" placeholder="name"/></label><br/>
            <label>Load:       <select id="configList"></select></label><br/>
            <button id="apply-btn">Apply</button>
            <button id="save-btn">Save</button>
            <button id="load-btn">Load</button>
            <button id="del-btn">Delete</button>
        `;
        document.body.appendChild(configPanel);
        populateConfigDropdown();
        document.getElementById('apply-btn').addEventListener('click',() => {
            size = +document.getElementById('cfg-size').value;
            rowClueCount = +document.getElementById('cfg-row-clues').value;
            colClueCount = +document.getElementById('cfg-col-clues').value;
            ratio = parseFloat(document.getElementById('cfg-ratio').value);
            const val=document.getElementById('configList').value; currentConfigName=val||currentConfigName;
            saveConfig(currentConfigName); createGrid();
        });
        document.getElementById('save-btn').addEventListener('click',()=>{ const name=document.getElementById('cfg-name').value.trim()||prompt('Config name?'); if(name) saveConfig(name);} );
        document.getElementById('load-btn').addEventListener('click',()=>{ const name=document.getElementById('configList').value; if(name) loadConfig(name);} );
        document.getElementById('del-btn').addEventListener('click',()=>{ const name=document.getElementById('configList').value; if(name&&confirm(`Delete config "${name}"?`)) deleteConfig(name);} );
    }

    // Toggle config panel
    function toggleConfigPanel() {
        if (configPanel) configPanel.style.display = configPanel.style.display === 'none' ? 'block' : 'none';
    }

    // Update control positions
    function updateControlPositions() {
        const g = document.getElementById('nonogram-grid').getBoundingClientRect();
        buttonContainer.style.left = `${g.left}px`;
        buttonContainer.style.top  = `${g.bottom + 8}px`;
        controlContainer.style.left = `${g.right + 8}px`;
        controlContainer.style.top  = `${g.top}px`;
    }

    // Initialization
    window.addEventListener('load', () => {
        createGrid();
        createConfigPanel();
    });
})();
