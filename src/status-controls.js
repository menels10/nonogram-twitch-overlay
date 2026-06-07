// Builds the side controls, extra settings panel, and clickable status preview canvases.
import { saveUIConfig, state, statusRegions } from './state.js';
import {
  decrementCols,
  decrementFineTune,
  decrementSize,
  exportDartCommand,
  incrementCols,
  incrementFineTune,
  incrementSize,
  resetSizeDefaults
} from './nonogram-grid.js';
import { ensureProgressLoop, ensureSendLoop, sendMessageWithEvent, stopProgressLoop } from './twitch-chat.js';

const MINIMIZE_BUTTON_STYLE = {
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
};

function createCheckboxOption({ id, checked, label, onChange, marginTop = '8px' }) {
  const wrapper = document.createElement('div');
  wrapper.style.marginTop = marginTop;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.checked = checked;
  checkbox.style.marginRight = '6px';
  checkbox.addEventListener('change', () => onChange(checkbox.checked));

  const labelElement = document.createElement('label');
  labelElement.htmlFor = id;
  labelElement.textContent = label;

  wrapper.appendChild(checkbox);
  wrapper.appendChild(labelElement);
  return { wrapper, checkbox };
}

function createMinimizeButton(onClick) {
  const button = document.createElement('button');
  button.textContent = 'X';
  Object.assign(button.style, MINIMIZE_BUTTON_STYLE);
  button.onclick = onClick;
  return button;
}

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

  const { wrapper: minDiv } = createCheckboxOption({
    id: 'chk-minimize',
    checked: state.showMinimizeButtons,
    label: 'Enable minimize/restore',
    marginTop: '0',
    onChange: checked => {
      state.showMinimizeButtons = checked;
      state.uiConfig.showMinimizeButtons = state.showMinimizeButtons;
      saveUIConfig();
      if (state.showMinimizeButtons) {
        if (!state.minimizeBtn && !state.isMinimized) {
          state.minimizeBtn = createMinimizeButton(minimizeCanvasRef);
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
    }
  });

  const { wrapper: blueDiv } = createCheckboxOption({
    id: 'chk-bluefill',
    checked: state.useBlueFill,
    label: 'Use blue fill color',
    onChange: checked => {
      state.useBlueFill = checked;
      state.uiConfig.useBlueFill = state.useBlueFill;
      saveUIConfig();
      createGridRef();
    }
  });

  const { wrapper: statusDivToggle } = createCheckboxOption({
    id: 'chk-status',
    checked: state.statusEnabled,
    label: 'Status canvas',
    onChange: checked => {
      state.statusEnabled = checked;
      state.uiConfig.statusEnabled = state.statusEnabled;
      saveUIConfig();
      const scCont = document.getElementById('status-container');
      if (scCont) scCont.style.display = state.statusEnabled ? 'block' : 'none';
    }
  });

  const { wrapper: autosendDiv } = createCheckboxOption({
    id: 'chk-autosend',
    checked: state.autosendEnabled,
    label: 'Auto-send chat commands',
    onChange: checked => {
      state.autosendEnabled = checked;
      state.uiConfig.autosendEnabled = state.autosendEnabled;
      saveUIConfig();
      if (state.autosendEnabled) {
        ensureSendLoop();
        ensureProgressLoop();
      } else {
        stopProgressLoop();
      }
    }
  });

  const { wrapper: fineDiv } = createCheckboxOption({
    id: 'chk-fine',
    checked: state.fineTuningEnabled,
    label: 'Enable fine-tune controls',
    onChange: checked => {
      state.fineTuningEnabled = checked;
      state.uiConfig.fineTuningEnabled = state.fineTuningEnabled;
      saveUIConfig();
      const fineSection = document.getElementById('section-fine');
      if (fineSection) {
        fineSection.style.display = state.fineTuningEnabled ? 'block' : 'none';
      }
    }
  });

  const { wrapper: sharpenDiv } = createCheckboxOption({
    id: 'chk-sharpen',
    checked: state.sharpeningEnabled,
    label: 'Enable sharpen filter',
    onChange: checked => {
      state.sharpeningEnabled = checked;
      state.uiConfig.sharpeningEnabled = state.sharpeningEnabled;
      saveUIConfig();
    }
  });

  const { wrapper: guardDiv } = createCheckboxOption({
    id: 'chk-guard',
    checked: state.guardExport,
    label: 'Coupon auto-redeem before sending commands',
    onChange: checked => {
      state.guardExport = checked;
      state.uiConfig.guardExport = state.guardExport;
      saveUIConfig();
    }
  });

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
  const cmdGroups = [
    ['!eat', '!feed', '!munch', '!snack', '!nibble', '!devour', '!nom', '!dine'],
    ['!sleep', '!nap', '!rest', '!doze', '!snooze', '!hibernate', '!bed', '!chill'],
    ['!play', '!game', '!interact', '!train']
  ];

  function randomizeCaps(str) {
    return str.split('').map(ch =>
      Math.random() < 0.5 ? ch.toUpperCase() : ch.toLowerCase()
    ).join('');
  }

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
      const group = cmdGroups[idx] || [];
      if (!group.length) return;
      const base = group[Math.floor(Math.random() * group.length)];
      const cmd = randomizeCaps(base);
      try {
        sendMessageWithEvent(cmd);
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
