// Builds the side controls, extra settings panel, and clickable status preview canvases.
import { saveLayout, saveUIConfig, state, statusRegions } from './state.js';
import {
  decrementCols,
  decrementFineTune,
  decrementSize,
  exportDartCommand,
  incrementCols,
  incrementFineTune,
  incrementSize,
  initCells,
  resetSizeDefaults
} from './nonogram-grid.js';
import { ensureProgressLoop, ensureSendLoop, send_message_with_event, stopProgressLoop } from './twitch-chat.js';

let updateCanvasSizeRef;
let createGridRef;
let minimizeCanvasRef;

export function configureStatusControls({ updateCanvasSize, createGrid, minimizeCanvas }) {
  updateCanvasSizeRef = updateCanvasSize;
  createGridRef = createGrid;
  minimizeCanvasRef = minimizeCanvas;
}

export function createControlPanel() {
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

  state.frame.appendChild(controlContainer);

  state.labelMap = {};
  state.controlSections = [
    { key: 'size', label: 'Grid size', get: () => state.size, dec: decrementSize, inc: incrementSize },
    { key: 'cols', label: 'Col clues', get: () => state.colClueCount, dec: decrementCols, inc: incrementCols },
    { key: 'fine', label: 'Fine tune', get: () => state.fineTune, dec: decrementFineTune, inc: incrementFineTune }
  ];

  state.controlSections.forEach((s, i) => {
    const sec = document.createElement('div');
    sec.id = `section-${s.key}`;
    if (s.key === 'fine' && !state.fineTuningEnabled) {
      sec.style.display = 'none';
    }

    const lbl = document.createElement('div');
    lbl.textContent = `${s.label}: ${s.get()}`;
    state.labelMap[s.key] = lbl;
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
        resetSizeDefaults();
        lbl.textContent = `${s.label}: ${s.get()}`;
      });
      row.appendChild(resetBtn);
    }

    if (s.key === 'cols') {
      const spacer = document.createElement('div');
      spacer.style.flex = '1';
      row.appendChild(spacer);

      state.exportDartBtn = document.createElement('button');
      state.exportDartBtn.textContent = '🎯';
      Object.assign(state.exportDartBtn.style, {
        width: '28px',
        height: '28px',
        border: '1px solid #D6B1AA',
        borderRadius: '4px',
        fontSize: '16px',
        cursor: 'pointer',
        backgroundColor: '#FFFFFF',
        color: 'white',
        textAlign: 'center'
      });
      state.exportDartBtn.addEventListener('click', exportDartCommand);
      row.appendChild(state.exportDartBtn);
    }

    sec.appendChild(row);
    controlContainer.appendChild(sec);
    if (i < state.controlSections.length - 1) controlContainer.appendChild(document.createElement('hr'));
  });

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
    state.zoomFactor = Math.max(0.1, state.zoomFactor * 0.9);
    updateCanvasSizeRef();
  }));
  magRow.appendChild(makeZoomBtn('+', () => {
    state.zoomFactor = state.zoomFactor * 1.1;
    updateCanvasSizeRef();
  }));

  magSec.appendChild(magRow);
  controlContainer.appendChild(magSec);
}

export function updateAllLabels() {
  Object.entries(state.labelMap).forEach(([k, lbl]) => {
    const section = state.controlSections.find(s => s.key === k);
    if (section) lbl.textContent = `${section.label}: ${section.get()}`;
  });
}

export function createExtraConfigPanel() {
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

  const minDiv = document.createElement('div');
  const minChk = document.createElement('input');
  minChk.type = 'checkbox';
  minChk.id = 'chk-minimize';
  minChk.checked = state.showMinimizeButtons;
  minChk.style.marginRight = '6px';
  minChk.addEventListener('change', () => {
    state.showMinimizeButtons = minChk.checked;
    state.uiConfig.showMinimizeButtons = state.showMinimizeButtons;
    saveUIConfig();
    if (state.showMinimizeButtons) {
      if (!state.minimizeBtn && !state.isMinimized) {
        state.minimizeBtn = document.createElement('button');
        state.minimizeBtn.textContent = 'X';
        Object.assign(state.minimizeBtn.style, {
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
        state.minimizeBtn.onclick = minimizeCanvasRef;
        state.frame.appendChild(state.minimizeBtn);
      }
    } else {
      if (state.minimizeBtn && state.minimizeBtn.parentElement) {
        state.minimizeBtn.remove();
        state.minimizeBtn = null;
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

  const blueDiv = document.createElement('div');
  blueDiv.style.marginTop = '8px';
  const blueChk = document.createElement('input');
  blueChk.type = 'checkbox';
  blueChk.id = 'chk-bluefill';
  blueChk.checked = state.useBlueFill;
  blueChk.style.marginRight = '6px';
  blueChk.addEventListener('change', () => {
    state.useBlueFill = blueChk.checked;
    state.uiConfig.useBlueFill = state.useBlueFill;
    saveUIConfig();
    createGridRef();
  });
  const blueLabel = document.createElement('label');
  blueLabel.htmlFor = 'chk-bluefill';
  blueLabel.textContent = 'Use blue fill color';
  blueDiv.appendChild(blueChk);
  blueDiv.appendChild(blueLabel);

  const statusDivToggle = document.createElement('div');
  statusDivToggle.style.marginTop = '8px';
  const statusChk = document.createElement('input');
  statusChk.type = 'checkbox';
  statusChk.id = 'chk-status';
  statusChk.checked = state.statusEnabled;
  statusChk.style.marginRight = '6px';
  statusChk.addEventListener('change', () => {
    state.statusEnabled = statusChk.checked;
    state.uiConfig.statusEnabled = state.statusEnabled;
    saveUIConfig();
    const scCont = document.getElementById('status-container');
    if (scCont) scCont.style.display = state.statusEnabled ? 'block' : 'none';
  });
  const statusLabel = document.createElement('label');
  statusLabel.htmlFor = 'chk-status';
  statusLabel.textContent = 'Status canvas';
  statusDivToggle.appendChild(statusChk);
  statusDivToggle.appendChild(statusLabel);

  const autosendDiv = document.createElement('div');
  autosendDiv.style.marginTop = '8px';
  const autosendChk = document.createElement('input');
  autosendChk.type = 'checkbox';
  autosendChk.id = 'chk-autosend';
  autosendChk.checked = state.autosendEnabled;
  autosendChk.style.marginRight = '6px';
  autosendChk.addEventListener('change', () => {
    state.autosendEnabled = autosendChk.checked;
    state.uiConfig.autosendEnabled = state.autosendEnabled;
    saveUIConfig();
    if (state.autosendEnabled) {
      ensureSendLoop();
      ensureProgressLoop();
    } else {
      stopProgressLoop();
    }
  });
  const autosendLabel = document.createElement('label');
  autosendLabel.htmlFor = 'chk-autosend';
  autosendLabel.textContent = 'Auto-send chat commands';
  autosendDiv.appendChild(autosendChk);
  autosendDiv.appendChild(autosendLabel);

  const fineDiv = document.createElement('div');
  fineDiv.style.marginTop = '8px';
  const fineChk = document.createElement('input');
  fineChk.type = 'checkbox';
  fineChk.id = 'chk-fine';
  fineChk.checked = state.fineTuningEnabled;
  fineChk.style.marginRight = '6px';
  fineChk.addEventListener('change', () => {
    state.fineTuningEnabled = fineChk.checked;
    state.uiConfig.fineTuningEnabled = state.fineTuningEnabled;
    saveUIConfig();
    const fineSection = document.getElementById('section-fine');
    if (fineSection) {
      fineSection.style.display = state.fineTuningEnabled ? 'block' : 'none';
    }
  });
  const fineLabel = document.createElement('label');
  fineLabel.htmlFor = 'chk-fine';
  fineLabel.textContent = 'Enable fine-tune controls';
  fineDiv.appendChild(fineChk);
  fineDiv.appendChild(fineLabel);

  const sharpenDiv = document.createElement('div');
  sharpenDiv.style.marginTop = '8px';
  const sharpenChk = document.createElement('input');
  sharpenChk.type = 'checkbox';
  sharpenChk.id = 'chk-sharpen';
  sharpenChk.checked = state.sharpeningEnabled;
  sharpenChk.style.marginRight = '6px';
  sharpenChk.addEventListener('change', () => {
    state.sharpeningEnabled = sharpenChk.checked;
    state.uiConfig.sharpeningEnabled = state.sharpeningEnabled;
    saveUIConfig();
  });
  const sharpenLabel = document.createElement('label');
  sharpenLabel.htmlFor = 'chk-sharpen';
  sharpenLabel.textContent = 'Enable sharpen filter';
  sharpenDiv.appendChild(sharpenChk);
  sharpenDiv.appendChild(sharpenLabel);

  const guardDiv = document.createElement('div');
  guardDiv.style.marginTop = '8px';
  const guardChk = document.createElement('input');
  guardChk.type = 'checkbox';
  guardChk.id = 'chk-guard';
  guardChk.checked = state.guard_Export;
  guardChk.addEventListener('change', () => {
    state.guard_Export = guardChk.checked;
    state.uiConfig.guardExport = state.guard_Export;
    localStorage.setItem('nonogramUIConfig', JSON.stringify(state.uiConfig));
    console.log('[Reward Redeemer] Guard export set to', state.guard_Export);
  });
  const guardLabel = document.createElement('label');
  guardLabel.htmlFor = 'chk-guard';
  guardLabel.textContent = 'Coupon auto-redeem before sending commands';
  guardDiv.appendChild(guardChk);
  guardDiv.appendChild(guardLabel);

  panel.appendChild(autosendDiv);
  panel.appendChild(guardDiv);
  panel.appendChild(minDiv);
  panel.appendChild(blueDiv);
  panel.appendChild(statusDivToggle);
  panel.appendChild(fineDiv);
  panel.appendChild(sharpenDiv);

  state.frame.appendChild(panel);
}

export function toggleExtraConfigPanel() {
  const panel = document.getElementById('extra-config-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

export function createConfigPanel() {
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
    <label>Size: <input id="cfg-size" type="number" value="${state.size}" /></label><br/>
    <label>Col Clues: <input id="cfg-cols" type="number" value="${state.colClueCount}" /></label><br/>
    <label>Fine Tune: <input id="cfg-fine" type="number" value="${state.fineTune}" /></label><br/>
    <label>Anchor X: <input id="cfg-anchorX" type="number" value="${state.anchorX}" /></label><br/>
    <label>Anchor Y: <input id="cfg-anchorY" type="number" value="${state.anchorY}" /></label><br/>
    <button id="cfg-apply">Apply</button>
    <button id="cfg-close">Close</button>
  `;
  document.body.appendChild(panel);

  panel.querySelector('#cfg-apply').onclick = () => {
    state.size = +panel.querySelector('#cfg-size').value;
    state.colClueCount = +panel.querySelector('#cfg-cols').value;
    state.fineTune = +panel.querySelector('#cfg-fine').value;
    state.anchorX = +panel.querySelector('#cfg-anchorX').value;
    state.anchorY = +panel.querySelector('#cfg-anchorY').value;
    saveLayout();
    initCells();
    updateCanvasSizeRef();
  };

  panel.querySelector('#cfg-close').onclick = () => {
    panel.style.display = 'none';
  };
}

export function createStatusContainer() {
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

  const cw = Math.max(40, controlContainer.clientWidth - 20);
  const ch = Math.round((cw * 80) / 250);
  const cmds = ['!eat', '!sleep', '!play'];

  state.statusCanvases = [];

  statusRegions.forEach((region, idx) => {
    const sc = document.createElement('canvas');
    sc.id = `status-canvas-${idx}`;
    sc.width = cw;
    sc.height = ch;
    sc.style.cssText = `
      display: inline-block;
      margin: 4px;
      width: ${cw}px;
      height: ${ch}px;
      border: 1px solid #333;
      background: black;
      cursor: pointer;
      box-sizing: content-box;
    `;

    const sctx = sc.getContext('2d');
    sc.addEventListener('click', () => {
      let cmd = cmds[idx] || '';
      if (!cmd) return;
      if (state.statusAltCmd) cmd = cmd + 's';
      console.log(`[StatusCanvas] clicked index=${idx}, sending ${cmd}`);
      try {
        send_message_with_event(cmd);
        state.statusAltCmd = !state.statusAltCmd;
      } catch (e) {
        console.error('Failed to send status command:', e);
      }
    });

    scCont.appendChild(sc);
    state.statusCanvases.push({ canvas: sc, ctx: sctx, region });
  });

  controlContainer.appendChild(scCont);
  scCont.style.display = state.statusEnabled ? 'block' : 'none';
}

export function createControlAndStatus() {
  createControlPanel();
  createStatusContainer();
}
