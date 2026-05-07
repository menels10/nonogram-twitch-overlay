// Holds shared runtime state, persistent config, and layout constants used across modules.
const DEFAULT_UI_CONFIG = {
    showMinimizeButtons: false,
    useBlueFill: false,
    statusEnabled: false,
    fineTuningEnabled: false,
    sharpeningEnabled: false,
    autosendEnabled: false,
    guardExport: false
  };

export const state = {
  uiConfig: { ...DEFAULT_UI_CONFIG },
  roiCanvas: null,
  roiCtx: null,
  DEFAULT_CONF: { anchorX: 10, anchorY: 10, zoomFactor: 1.4, fineTune: 0 },
  size: 4,
  colClueCount: 1,
  anchorX: 10,
  anchorY: 10,
  zoomFactor: 1.4,
  fineTune: 0,
  roiWidthPercent: 0.36,
  roiHeightPercent: 0.584,
  configs: {},
  autosendEnabled: false,
  canvas: null,
  ctx: null,
  frame: null,
  buttonContainer: null,
  isDragging: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  lastExported: new Set(),
  lastExportedWhite: new Set(),
  cellStates: [],
  hoveredRow: -1,
  hoveredCol: -1,
  isMarking: false,
  markValue: 0,
  eraseMode: false,
  isMinimized: false,
  isPaused: false,
  renderHandle: null,
  minimizeBtn: null,
  moveHistory: [],
  currentAction: null,
  geometryCache: null,
  lastDartExportIndex: 1,
  COOLDOWN_MS: 10_000,
  nextSendAt: 0,
  sendQueue: [],
  sendLoopTimer: null,
  progressTimer: null,
  exportFillBtn: null,
  exportEmptyBtn: null,
  exportDartBtn: null,
  statusAltCmd: false,
  rowDashes: [],
  colDashes: [],
  lastGuardRedeem: 0,
  REDEEM_KEY: 'lastRedeemTimestamp',
  activityBtnMonitorId: null,
  redeemBusy: false,
  statusCanvases: [],
  currentChat: null,
  labelMap: {},
  controlSections: [],
  roiInterval: null,
  autoRedeemTimer: null,
  documentMouseMoveHandler: null,
  documentMouseUpHandler: null
};

export function initState() {
  const storedUIConfig = JSON.parse(localStorage.getItem('nonogramUIConfig') || 'null') || {};
  state.uiConfig = { ...DEFAULT_UI_CONFIG, ...storedUIConfig };

  if (typeof state.uiConfig.sharpeningEnabled !== 'boolean') {
    state.uiConfig.sharpeningEnabled = false;
  }

  state.configs = JSON.parse(localStorage.getItem('nonogramConfigMap') || 'null') || {};
  state.roiCanvas = document.createElement('canvas');
  state.roiCtx = state.roiCanvas.getContext('2d');
  state.anchorX = state.DEFAULT_CONF.anchorX;
  state.anchorY = state.DEFAULT_CONF.anchorY;
  state.zoomFactor = state.DEFAULT_CONF.zoomFactor;
  state.fineTune = state.DEFAULT_CONF.fineTune;
  state.showMinimizeButtons = state.uiConfig.showMinimizeButtons;
  state.useBlueFill = state.uiConfig.useBlueFill;
  state.statusEnabled = state.uiConfig.statusEnabled;
  state.fineTuningEnabled = state.uiConfig.fineTuningEnabled;
  state.sharpeningEnabled = state.uiConfig.sharpeningEnabled;
  state.guardExport = state.uiConfig.guardExport;
  state.autosendEnabled = state.uiConfig.autosendEnabled ?? false;
}

export function saveUIConfig() {
  localStorage.setItem('nonogramUIConfig', JSON.stringify(state.uiConfig));
}

export const sizeLookup = {
  '4_1': { cellSize: 90.7, anchorX: 1, anchorY: 10 },
  '4_2': { cellSize: 85.3, anchorX: 1, anchorY: 10 },
  '5_1': { cellSize: 73.3, anchorX: 1, anchorY: 10 },
  '5_2': { cellSize: 69.3, anchorX: 1, anchorY: 10 },
  '5_3': { cellSize: 65.3, anchorX: 1, anchorY: 10 },
  '6_1': { cellSize: 61.3, anchorX: 1, anchorY: 10 },
  '6_2': { cellSize: 57.3, anchorX: 1, anchorY: 10 },
  '6_3': { cellSize: 54.6, anchorX: 1, anchorY: 10 },
  '7_1': { cellSize: 51.9, anchorX: 1, anchorY: 10 },
  '7_2': { cellSize: 49.5, anchorX: 1, anchorY: 10 },
  '7_3': { cellSize: 46.7, anchorX: 1, anchorY: 10 },
  '7_4': { cellSize: 44.1, anchorX: 1, anchorY: 10 },
  '8_1': { cellSize: 45.3, anchorX: 1, anchorY: 10 },
  '8_2': { cellSize: 42.7, anchorX: 1, anchorY: 10 },
  '8_3': { cellSize: 41.3, anchorX: 1, anchorY: 10 },
  '8_4': { cellSize: 38.7, anchorX: 1, anchorY: 10 },
  '9_1': { cellSize: 40, anchorX: 1, anchorY: 10 },
  '9_2': { cellSize: 38.7, anchorX: 1, anchorY: 10 },
  '9_3': { cellSize: 37.3, anchorX: 1, anchorY: 10 },
  '9_4': { cellSize: 34.7, anchorX: 1, anchorY: 10 },
  '9_5': { cellSize: 33.3, anchorX: 1, anchorY: 10 },
  '10_1': { cellSize: 36, anchorX: 1, anchorY: 10 },
  '10_2': { cellSize: 34.7, anchorX: 1, anchorY: 10 },
  '10_3': { cellSize: 33.3, anchorX: 1, anchorY: 10 },
  '10_4': { cellSize: 30.7, anchorX: 1, anchorY: 10 },
  '10_5': { cellSize: 29.3, anchorX: 1, anchorY: 10 },
  '11_1': { cellSize: 33.3, anchorX: 1, anchorY: 10 },
  '11_2': { cellSize: 32, anchorX: 1, anchorY: 10 },
  '11_3': { cellSize: 30.7, anchorX: 1, anchorY: 10 },
  '11_4': { cellSize: 29.4, anchorX: 1.75, anchorY: 10 },
  '11_5': { cellSize: 28, anchorX: 1.75, anchorY: 10 },
  '11_6': { cellSize: 26.7, anchorX: 1.75, anchorY: 10 },
  '12_1': { cellSize: 30.7, anchorX: 1, anchorY: 10 },
  '12_2': { cellSize: 29.3, anchorX: 1, anchorY: 10 },
  '12_3': { cellSize: 28, anchorX: 1, anchorY: 10 },
  '12_4': { cellSize: 26.7, anchorX: 1.75, anchorY: 10 },
  '12_5': { cellSize: 25.3, anchorX: 1.75, anchorY: 10 },
  '12_6': { cellSize: 24.1, anchorX: 1.75, anchorY: 10 },
  '13_1': { cellSize: 28, anchorX: 1, anchorY: 10 },
  '13_2': { cellSize: 26.7, anchorX: 1, anchorY: 10 },
  '13_3': { cellSize: 25.4, anchorX: 1, anchorY: 10 },
  '13_4': { cellSize: 25.4, anchorX: 1.5, anchorY: 10 },
  '13_5': { cellSize: 24, anchorX: 1.5, anchorY: 10 },
  '13_6': { cellSize: 22.7, anchorX: 1.5, anchorY: 10 },
  '13_7': { cellSize: 21.4, anchorX: 1, anchorY: 10 },
  '14_1': { cellSize: 26.7, anchorX: 1, anchorY: 10 },
  '14_2': { cellSize: 25.3, anchorX: 1.5, anchorY: 10 },
  '14_3': { cellSize: 24, anchorX: 1, anchorY: 10 },
  '14_4': { cellSize: 22.7, anchorX: 1, anchorY: 10 },
  '14_5': { cellSize: 21.3, anchorX: 1, anchorY: 10 },
  '14_6': { cellSize: 21.4, anchorX: 1.5, anchorY: 10 },
  '14_7': { cellSize: 20, anchorX: 1, anchorY: 10 },
  '15_1': { cellSize: 24, anchorX: 1, anchorY: 10 },
  '15_2': { cellSize: 24, anchorX: 1.5, anchorY: 10 },
  '15_3': { cellSize: 22.7, anchorX: 1, anchorY: 10 },
  '15_4': { cellSize: 21.3, anchorX: 4, anchorY: 10 },
  '15_5': { cellSize: 21.3, anchorX: 1.5, anchorY: 10 },
  '15_6': { cellSize: 20, anchorX: 1.5, anchorY: 10 },
  '15_7': { cellSize: 18.7, anchorX: 1.5, anchorY: 10 },
  '15_8': { cellSize: 18.7, anchorX: 1.5, anchorY: 10 },
  '16_1': { cellSize: 22.6, anchorX: 1, anchorY: 10 },
  '16_2': { cellSize: 22.7, anchorX: 1, anchorY: 10 },
  '16_3': { cellSize: 21.3, anchorX: 1.25, anchorY: 10 },
  '16_4': { cellSize: 20, anchorX: 1.5, anchorY: 10 },
  '16_5': { cellSize: 20, anchorX: 1.5, anchorY: 10 },
  '16_6': { cellSize: 18.7, anchorX: 1.5, anchorY: 10 },
  '16_7': { cellSize: 17.3, anchorX: 1.5, anchorY: 10 },
  '16_8': { cellSize: 17.4, anchorX: 1.5, anchorY: 10 },
  '17_1': { cellSize: 21.3, anchorX: 1, anchorY: 10 },
  '17_2': { cellSize: 21.4, anchorX: 1, anchorY: 10 },
  '17_3': { cellSize: 20, anchorX: 1, anchorY: 10 },
  '17_4': { cellSize: 18.7, anchorX: 1, anchorY: 10 },
  '17_5': { cellSize: 18.7, anchorX: 1, anchorY: 10 },
  '17_6': { cellSize: 17.3, anchorX: 1.75, anchorY: 10 },
  '17_7': { cellSize: 17.3, anchorX: 1.5, anchorY: 10 },
  '17_8': { cellSize: 16, anchorX: 1.5, anchorY: 10 },
  '17_9': { cellSize: 14.7, anchorX: 1.5, anchorY: 10 },
  '18_1': { cellSize: 20, anchorX: 1, anchorY: 10 },
  '18_2': { cellSize: 20, anchorX: 1.5, anchorY: 10 },
  '18_3': { cellSize: 18.7, anchorX: 1.5, anchorY: 10 },
  '18_4': { cellSize: 18.7, anchorX: 1.5, anchorY: 10 },
  '18_5': { cellSize: 17.3, anchorX: 1.5, anchorY: 10.5 },
  '18_6': { cellSize: 16, anchorX: 1.5, anchorY: 10.5 },
  '18_7': { cellSize: 16, anchorX: 1.5, anchorY: 10.5 },
  '18_8': { cellSize: 14.7, anchorX: 1.5, anchorY: 10.5 },
  '18_9': { cellSize: 14.6, anchorX: 1.5, anchorY: 10.5 },
  '19_1': { cellSize: 18.6, anchorX: 1.5, anchorY: 10.5 },
  '19_2': { cellSize: 18.6, anchorX: 4, anchorY: 10.5 },
  '19_3': { cellSize: 17.3, anchorX: 1.5, anchorY: 10.5 },
  '19_4': { cellSize: 17.3, anchorX: 1.5, anchorY: 10.5 },
  '19_5': { cellSize: 16, anchorX: 1.5, anchorY: 10.5 },
  '19_6': { cellSize: 16, anchorX: 1.5, anchorY: 10.5 },
  '19_7': { cellSize: 14.6, anchorX: 1.5, anchorY: 10.5 },
  '19_8': { cellSize: 14.7, anchorX: 1.5, anchorY: 10.5 },
  '19_9': { cellSize: 13.3, anchorX: 1.5, anchorY: 10.5 },
  '19_10': { cellSize: 13.3, anchorX: 1.5, anchorY: 10.5 },
  '20_1': { cellSize: 18.7, anchorX: 1.5, anchorY: 10 },
  '20_2': { cellSize: 17.3, anchorX: 1.5, anchorY: 10 },
  '20_3': { cellSize: 17.3, anchorX: 1.5, anchorY: 10 },
  '20_4': { cellSize: 16, anchorX: 1.5, anchorY: 10 },
  '20_5': { cellSize: 16, anchorX: 1.5, anchorY: 10 },
  '20_6': { cellSize: 14.65, anchorX: 1.5, anchorY: 10 },
  '20_7': { cellSize: 14.6, anchorX: 1.5, anchorY: 10 },
  '20_8': { cellSize: 13.3, anchorX: 1.75, anchorY: 10 },
  '20_9': { cellSize: 13.3, anchorX: 1.5, anchorY: 10 },
  '20_10': { cellSize: 12, anchorX: 1.5, anchorY: 10 }
};

export const statusRegions = [
  { sx: 200, sy: 980, sw: 250, sh: 70 },
  { sx: 500, sy: 980, sw: 250, sh: 70 },
  { sx: 800, sy: 980, sw: 250, sh: 70 }
];

export function getKey(sz, cc) {
  return `${sz}x${cc}`;
}

export function getLayoutSettings(size, colClueLength) {
  const key = `${size}_${colClueLength}`;
  const entry = sizeLookup[key];
  if (!entry) {
    console.warn(`No layout settings found for size=${size}, colClueLength=${colClueLength}`);
    return null;
  }
  return {
    cellSize: entry.cellSize,
    anchorX: entry.anchorX,
    anchorY: entry.anchorY
  };
}

export function saveLayout() {
  const key = getKey(state.size, state.colClueCount);
  state.configs[key] = {
    anchorX: state.anchorX,
    anchorY: state.anchorY,
    fineTune: state.fineTune,
    size: state.size,
    colClueCount: state.colClueCount
  };
  localStorage.setItem('nonogramConfigMap', JSON.stringify(state.configs));
}

export function loadLayout() {
  const layout = getLayoutSettings(state.size, state.colClueCount);
  if (layout) {
    state.anchorX = layout.anchorX;
    state.anchorY = layout.anchorY;
  }
  const key = getKey(state.size, state.colClueCount);
  const saved = state.configs[key];
  if (saved) {
    state.fineTune = saved.fineTune ?? state.fineTune;
  }
}

export function clearRenderHandle() {
  if (!state.renderHandle) return;
  if (typeof state.renderHandle === 'number') {
    cancelAnimationFrame(state.renderHandle);
  } else {
    clearTimeout(state.renderHandle);
  }
  state.renderHandle = null;
}
