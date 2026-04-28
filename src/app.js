// Bootstraps the userscript, wires the grouped modules together, and handles cleanup.
import { configureNonogramGrid, createGrid, initCells } from './nonogram-grid.js';
import { createMainButtons, render, setupCanvas, updateCanvasSize, minimizeCanvas } from './overlay-ui.js';
import { createConfigPanel, createControlAndStatus, createExtraConfigPanel, configureStatusControls } from './status-controls.js';
import { state, clearRenderHandle } from './state.js';
import { ensureProgressLoop } from './twitch-chat.js';
import { scheduleAutoRedeem } from './twitch-redeem.js';
import { updateROI } from './overlay-ui.js';

configureNonogramGrid({ updateCanvasSize });
configureStatusControls({ updateCanvasSize, createGrid, minimizeCanvas });

function cleanup() {
  if (state.redeemButtonMonitorId) clearInterval(state.redeemButtonMonitorId);
  if (state.activityBtnMonitorId) clearInterval(state.activityBtnMonitorId);
  if (state.progressTimer) clearInterval(state.progressTimer);
  if (state.sendLoopTimer) clearInterval(state.sendLoopTimer);
  if (state.autoRedeemTimer) clearTimeout(state.autoRedeemTimer);
  if (state.roiInterval) clearInterval(state.roiInterval);
  clearRenderHandle();

  if (state.documentMouseMoveHandler) {
    document.removeEventListener('mousemove', state.documentMouseMoveHandler);
  }
  if (state.documentMouseUpHandler) {
    document.removeEventListener('mouseup', state.documentMouseUpHandler);
  }
}

function onLoad() {
  setupCanvas();
  initCells();
  updateCanvasSize();
  createMainButtons();
  createConfigPanel();
  createControlAndStatus();
  createExtraConfigPanel();
  if (state.autosendEnabled) {
    state.nextSendAt = Date.now();
    ensureProgressLoop();
  }
  render();
  state.roiInterval = setInterval(updateROI, 1000);
  scheduleAutoRedeem();
}

export function bootstrap() {
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('load', onLoad);
}
