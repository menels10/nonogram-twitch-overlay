// ==UserScript==
// @name         Twitch Nonogram Grid (v1.6)
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Nonogram overlay for Twitch with config cycling, clipboard export, light background and styled buttons. Configs can be saved/loaded/deleted. Uses a single 'size' config. Background is lightly translucent white for better visibility on stream overlays or dark themes. Buttons are placed bottom-right next to config button for easy access.
// @author       chatgpt+mrpantera_666+Menels
// @match        https://www.twitch.tv/gokiccoon*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://menels10.github.io/nonogram-twitch-overlay/twitch-nonogram.user.js
// ==/UserScript==

(function () {
    'use strict';

    let configs = JSON.parse(localStorage.getItem('nonogramConfigs')) || {};
    let currentConfig = configs.default || { size: 10, cellSize: 30, gridX: 50, gridY: 50 };
    let { size, cellSize, gridX, gridY } = currentConfig;
    let isDragging = false;
    let offsetX, offsetY;
    let previousBlackCells = new Set();
    let configNames = Object.keys(configs);
    let currentConfigIndex = configNames.indexOf('default') >= 0 ? configNames.indexOf('default') : 0;

    let nextButton, prevButton;

    function saveConfig(name) {
        configs[name] = { size, cellSize, gridX, gridY };
        localStorage.setItem('nonogramConfigs', JSON.stringify(configs));
        populateConfigDropdown();
        configNames = Object.keys(configs);
    }

    function deleteConfig(name) {
        if (configs[name]) {
            delete configs[name];
            localStorage.setItem('nonogramConfigs', JSON.stringify(configs));
            populateConfigDropdown();
            configNames = Object.keys(configs);
            if (configNames.length > 0) {
                loadConfig(configNames[0]);
            } else {
                location.reload();
            }
        }
    }

    function loadConfig(name) {
        configNames = Object.keys(configs);
        currentConfigIndex = configNames.indexOf(name);
        if (configs[name]) {
            ({ size, cellSize, gridX, gridY } = configs[name]);
            createGrid();
        }
    }

    function loadNextConfig() {
        configNames = Object.keys(configs);
        if (configNames.length === 0) return;
        currentConfigIndex = (currentConfigIndex + 1) % configNames.length;
        loadConfig(configNames[currentConfigIndex]);
    }

    function loadPreviousConfig() {
        configNames = Object.keys(configs);
        if (configNames.length === 0) return;
        currentConfigIndex = (currentConfigIndex - 1 + configNames.length) % configNames.length;
        loadConfig(configNames[currentConfigIndex]);
    }

    function populateConfigDropdown() {
        let configDropdown = document.getElementById('configList');
        if (!configDropdown) return;
        configDropdown.innerHTML = '';
        Object.keys(configs).forEach(name => {
            let option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            configDropdown.appendChild(option);
        });
    }

    function createGrid() {
        previousBlackCells = new Set();
        let grid = document.getElementById('nonogram-grid');
        if (grid) grid.remove();

        grid = document.createElement('div');
        grid.id = 'nonogram-grid';
        grid.style.position = 'fixed';
        grid.style.top = `${gridY}px`;
        grid.style.left = `${gridX}px`;
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
        grid.style.gridTemplateRows = `repeat(${size}, ${cellSize}px)`;
        grid.style.zIndex = '10000';
        grid.style.border = '4px solid cyan';
        grid.style.cursor = 'move';
        grid.style.padding = '2px';
        grid.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';

        document.body.appendChild(grid);

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                let cell = document.createElement('div');
                cell.style.width = `${cellSize}px`;
                cell.style.height = `${cellSize}px`;
                cell.style.border = '1px solid rgba(0,255,255,0.2)';
                cell.style.backgroundColor = 'transparent';
                cell.style.pointerEvents = 'auto';
                cell.dataset.row = row;
                cell.dataset.col = col;

                cell.addEventListener('click', () => {
                    cell.style.backgroundColor = 'black';
                });

                cell.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (cell.style.backgroundColor === 'white') {
                        cell.style.backgroundColor = 'transparent';
                    } else {
                        cell.style.backgroundColor = 'white';
                    }
                });

                grid.appendChild(cell);
            }
        }

        makeGridDraggable(grid);
        createButtons();
        updateSizeButtonLabels();
    }

    function makeGridDraggable(grid) {
        grid.addEventListener('mousedown', (e) => {
            if (e.target === grid) {
                isDragging = true;
                offsetX = e.clientX - grid.offsetLeft;
                offsetY = e.clientY - grid.offsetTop;
                grid.style.pointerEvents = 'none';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                gridX = e.clientX - offsetX;
                gridY = e.clientY - offsetY;
                grid.style.left = `${gridX}px`;
                grid.style.top = `${gridY}px`;
                updateButtonPosition();
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            grid.style.pointerEvents = 'auto';
        });
    }

    function createButtons() {
        let buttonContainer = document.getElementById('button-container');
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.id = 'button-container';
            buttonContainer.style.position = 'fixed';
            buttonContainer.style.zIndex = '10001';
            buttonContainer.style.fontSize = "16px";
            buttonContainer.style.color = "white";
            buttonContainer.style.backgroundColor = "#007BFF";
            buttonContainer.style.padding = "4px";
            buttonContainer.style.display = "flex";
            buttonContainer.style.gap = "4px";
            document.body.appendChild(buttonContainer);
        }

        buttonContainer.innerHTML = '';

        const makeStyledButton = (id, label, handler) => {
            let btn = document.createElement('button');
            btn.id = id;
            btn.textContent = label;
            btn.style.padding = '6px 10px';
            btn.style.fontSize = '14px';
            btn.style.cursor = 'pointer';
            btn.style.border = 'none';
            btn.style.backgroundColor = '#0056b3';
            btn.style.color = 'white';
            btn.style.borderRadius = '4px';
            btn.addEventListener('click', handler);
            buttonContainer.appendChild(btn);
            return btn;
        };

        makeStyledButton('export-button', 'Export Black Cells', exportBlackCells);
        makeStyledButton('config-button', '⚙️ Config', toggleConfigPanel);
        nextButton = makeStyledButton('next-config-button', '', loadNextConfig);
        prevButton = makeStyledButton('prev-config-button', '', loadPreviousConfig);

        updateButtonPosition();
    }

    function updateSizeButtonLabels() {
        if (nextButton) {
            nextButton.textContent = `${size + 1}`;
            nextButton.style.backgroundColor = '#007BFF';
        }
        if (prevButton) {
            prevButton.textContent = `${Math.max(1, size - 1)}`;
            prevButton.style.backgroundColor = '#007BFF';
        }
    }

    function updateButtonPosition() {
        let buttonContainer = document.getElementById('button-container');
        if (buttonContainer) {
            buttonContainer.style.top = `${gridY + size * cellSize + 10}px`;
            buttonContainer.style.left = `${gridX}px`;
        }
    }

    function exportBlackCells() {
        let grid = document.getElementById('nonogram-grid');
        let cells = grid.children;
        let newBlackCells = new Set();

        for (let cell of cells) {
            if (cell.style.backgroundColor === 'black') {
                let row = parseInt(cell.dataset.row) + 1;
                let col = String.fromCharCode(97 + parseInt(cell.dataset.col));
                newBlackCells.add(`${col}${row}`);
            }
        }

        let added = [...newBlackCells].filter(x => !previousBlackCells.has(x));
        let removed = [...previousBlackCells].filter(x => !newBlackCells.has(x));

        if (added.length > 0) {
            copyToClipboard(`!fill ${added.join(' ')}`);
        } else if (removed.length > 0) {
            copyToClipboard(`!empty ${removed.join(' ')}`);
        }

        previousBlackCells = newBlackCells;
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('Clipboard copy failed:', err);
        });
    }

    function createConfigPanel() {
        let panel = document.getElementById('config-panel');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = 'config-panel';
        panel.style.position = 'fixed';
        panel.style.top = '10px';
        panel.style.left = '10px';
        panel.style.background = 'white';
        panel.style.color = 'black';
        panel.style.padding = '10px';
        panel.style.border = '1px solid black';
        panel.style.zIndex = '10001';
        panel.style.display = 'none';

        panel.innerHTML = `
            <label>Size: <input id="size" type="number" value="${size}" /></label><br>
            <label>Cell Size: <input id="cellSize" type="number" value="${cellSize}" /></label><br>
            <label>Save As: <input id="configName" type="text" /></label><br>
            <label>Load Config: <select id="configList"></select></label><br>
            <button id="apply-config">Apply</button>
            <button id="save-config">Save</button>
            <button id="load-config">Load</button>
            <button id="delete-config">Delete</button>
        `;

        document.body.appendChild(panel);
        populateConfigDropdown();

        document.getElementById('apply-config').addEventListener('click', () => {
            size = parseInt(document.getElementById('size').value);
            cellSize = parseInt(document.getElementById('cellSize').value);
            createGrid();
        });

        document.getElementById('save-config').addEventListener('click', () => {
            let name = document.getElementById('configName').value || 'default';
            saveConfig(name);
        });

        document.getElementById('load-config').addEventListener('click', () => {
            let name = document.getElementById('configList').value || 'default';
            loadConfig(name);
        });

        document.getElementById('delete-config').addEventListener('click', () => {
            let name = document.getElementById('configList').value;
            if (name && confirm(`Delete config "${name}"?`)) {
                deleteConfig(name);
            }
        });
    }

    function toggleConfigPanel() {
        let panel = document.getElementById('config-panel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    }

    window.addEventListener('load', () => {
        createGrid();
        createConfigPanel();
        window.toggleConfigPanel = toggleConfigPanel;
    });
})();
