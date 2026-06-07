// Bootstraps the userscript, wires the grouped modules together, and handles cleanup.
import { configureNonogramGrid, createGrid, initCells } from './nonogram-grid.js';
import { createMainButtons, render, setupCanvas, updateCanvasSize, minimizeCanvas, updateROI } from './overlay-ui.js';
import { createControlAndStatus, createExtraConfigPanel, configureStatusControls } from './status-controls.js';
import { state, clearRenderHandle, initState } from './state.js';
import { ensureProgressLoop } from './twitch-chat.js';
import { cancelAutoRedeem } from './twitch-redeem.js';

const readyCallbacks = [];
const shutdownCallbacks = [];
let hasBootstrapped = false;

function notifyCallbacks(callbacks) {
  callbacks.forEach(callback => {
    try {
      callback();
    } catch (error) {
      console.error('Lifecycle callback failed:', error);
    }
  });
}

function cleanup() {
  notifyCallbacks(shutdownCallbacks);

  if (state.activityBtnMonitorId) clearInterval(state.activityBtnMonitorId);
  if (state.progressTimer) clearInterval(state.progressTimer);
  if (state.sendLoopTimer) clearInterval(state.sendLoopTimer);
  if (state.roiInterval) clearInterval(state.roiInterval);
  cancelAutoRedeem();
  clearRenderHandle();

  if (state.documentMouseMoveHandler) {
    document.removeEventListener('mousemove', state.documentMouseMoveHandler);
  }
  if (state.documentMouseUpHandler) {
    document.removeEventListener('mouseup', state.documentMouseUpHandler);
  }
  if (state.canvas && state.canvasMouseDownHandler) {
    state.canvas.removeEventListener('mousedown', state.canvasMouseDownHandler);
  }
  if (state.canvas && state.canvasMouseMoveHandler) {
    state.canvas.removeEventListener('mousemove', state.canvasMouseMoveHandler);
  }
  if (state.canvas && state.canvasContextMenuHandler) {
    state.canvas.removeEventListener('contextmenu', state.canvasContextMenuHandler);
  }

  state.activityBtnMonitorId = null;
  state.progressTimer = null;
  state.sendLoopTimer = null;
  state.roiInterval = null;
  state.buttonContainer = null;
  state.documentMouseMoveHandler = null;
  state.documentMouseUpHandler = null;
  state.canvasMouseDownHandler = null;
  state.canvasMouseMoveHandler = null;
  state.canvasContextMenuHandler = null;
}

function onLoad() {
  if (hasBootstrapped) return;
  hasBootstrapped = true;

  initState();
  configureNonogramGrid({ updateCanvasSize });
  configureStatusControls({ updateCanvasSize, createGrid, minimizeCanvas });

  setupCanvas();
  initCells();
  updateCanvasSize();
  createMainButtons();
  createControlAndStatus();
  createExtraConfigPanel();
  if (state.autosendEnabled) {
    state.nextSendAt = Date.now();
    ensureProgressLoop();
  }
  render();
  state.roiInterval = setInterval(updateROI, 1000);
  notifyCallbacks(readyCallbacks);
}

export function onReady(callback) {
  readyCallbacks.push(callback);
}

export function onShutdown(callback) {
  shutdownCallbacks.push(callback);
}

export function bootstrap() {
  window.addEventListener('beforeunload', cleanup);
  if (document.readyState === 'complete') {
    onLoad();
    return;
  }

  window.addEventListener('load', onLoad, { once: true });
}
