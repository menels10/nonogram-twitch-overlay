// Manages the overlay frame, canvas rendering, ROI capture, and main action buttons.
import { clearRenderHandle, state } from './state.js';
import { createGrid, exportAllCells, exportCells, exportWhiteCells, onCanvasMouseDown, onCanvasMouseMove, undoLastAction, cleanAll } from './nonogram-grid.js';
import { toggleExtraConfigPanel } from './status-controls.js';
import { ensureProgressLoop } from './twitch-chat.js';
import { minutesSinceRedeem, redeemAndTrack } from './twitch-redeem.js';

export function sharpen(ctx, w, h, mix) {
  let x;
  let sx;
  let sy;
  let r;
  let g;
  let b;
  let a;
  let dstOff;
  let srcOff;
  let wt;
  let cx;
  let cy;
  let scy;
  let scx;
  const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const katet = Math.round(Math.sqrt(weights.length));
  const half = (katet * 0.5) | 0;
  const dstData = ctx.createImageData(w, h);
  const dstBuff = dstData.data;
  const srcBuff = ctx.getImageData(0, 0, w, h).data;
  let y = h;

  while (y--) {
    x = w;
    while (x--) {
      sy = y;
      sx = x;
      dstOff = (y * w + x) * 4;
      r = g = b = a = 0;

      for (cy = 0; cy < katet; cy++) {
        for (cx = 0; cx < katet; cx++) {
          scy = sy + cy - half;
          scx = sx + cx - half;
          if (scy >= 0 && scy < h && scx >= 0 && scx < w) {
            srcOff = (scy * w + scx) * 4;
            wt = weights[cy * katet + cx];
            r += srcBuff[srcOff] * wt;
            g += srcBuff[srcOff + 1] * wt;
            b += srcBuff[srcOff + 2] * wt;
            a += srcBuff[srcOff + 3] * wt;
          }
        }
      }

      dstBuff[dstOff] = r * mix + srcBuff[dstOff] * (1 - mix);
      dstBuff[dstOff + 1] = g * mix + srcBuff[dstOff + 1] * (1 - mix);
      dstBuff[dstOff + 2] = b * mix + srcBuff[dstOff + 2] * (1 - mix);
      dstBuff[dstOff + 3] = srcBuff[dstOff + 3];
    }
  }

  ctx.putImageData(dstData, 0, 0);
}

export function updateROI() {
  const video = [...document.querySelectorAll('video')].reverse().find(v => v.readyState >= 2);
  if (!video) return;

  state.roiCtx.clearRect(0, 0, state.roiCanvas.width, state.roiCanvas.height);

  const actualWidth = video.videoWidth;
  const actualHeight = video.videoHeight;
  const roiWidth = actualWidth * state.roiWidthPercent;
  const roiHeight = actualHeight * state.roiHeightPercent;
  const roiX = actualWidth - roiWidth;
  const roiY = actualHeight - roiHeight;

  state.roiCtx.drawImage(video, roiX, roiY, roiWidth, roiHeight, 0, 0, state.roiCanvas.width, state.roiCanvas.height);

  if (state.sharpeningEnabled) {
    sharpen(state.roiCtx, state.roiCanvas.width, state.roiCanvas.height, 0.9);
  }
}

export function drawStatus() {
  const video = [...document.querySelectorAll('video')].reverse().find(v => v.readyState >= 2);
  if (!video) return;

  const actualWidth = video.videoWidth;
  const actualHeight = video.videoHeight;
  const scaleX = actualWidth / 1920;
  const scaleY = actualHeight / 1080;

  state.statusCanvases.forEach(({ canvas: sc, ctx: sctx, region }) => {
    const sx = region.sx * scaleX;
    const sy = region.sy * scaleY;
    const sw = region.sw * scaleX;
    const sh = region.sh * scaleY;
    sctx.clearRect(0, 0, sc.width, sc.height);
    sctx.drawImage(video, sx, sy, sw, sh, 0, 0, sc.width, sc.height);
  });
}

export function render() {
  if (state.isMinimized || state.canvas.style.display === 'none') {
    return;
  }

  state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  state.ctx.drawImage(state.roiCanvas, 0, 0);
  createGrid();
  if (state.statusEnabled) drawStatus();

  if (!document.hidden) {
    state.renderHandle = requestAnimationFrame(render);
  } else {
    state.renderHandle = setTimeout(render, 1000 / 30);
  }
}

export function minimizeCanvas() {
  state.isMinimized = true;
  clearRenderHandle();

  state.canvas.style.display = 'none';
  state.frame.style.height = '0px';
  state.frame.style.width = '0px';

  const ctrl = document.getElementById('control-container');
  if (ctrl) ctrl.style.display = 'none';

  const btns = document.getElementById('button-container');
  if (btns) btns.style.display = 'none';

  const cfg = document.getElementById('config-panel');
  if (cfg) cfg.style.display = 'none';

  const extraCfg = document.getElementById('extra-config-panel');
  if (extraCfg) extraCfg.style.display = 'none';

  const statusCont = document.getElementById('status-container');
  if (statusCont) statusCont.style.display = 'none';

  const restoreBtn = document.getElementById('restore-button');
  if (restoreBtn) restoreBtn.style.display = 'block';

  if (state.minimizeBtn && state.minimizeBtn.parentElement) {
    state.minimizeBtn.remove();
    state.minimizeBtn = null;
  }
}

export function restoreCanvas() {
  state.isMinimized = false;
  state.canvas.style.display = 'block';
  updateCanvasSize();
  render();

  state.frame.style.height = `${state.canvas.height * state.zoomFactor + 40}px`;
  state.frame.style.width = `${state.canvas.width * state.zoomFactor}px`;

  const ctrl = document.getElementById('control-container');
  if (ctrl) ctrl.style.display = 'block';

  const btns = document.getElementById('button-container');
  if (btns) btns.style.display = 'flex';

  const restoreBtn = document.getElementById('restore-button');
  if (restoreBtn) restoreBtn.style.display = 'none';

  const statusCont = document.getElementById('status-container');
  if (statusCont) statusCont.style.display = state.statusEnabled ? 'block' : 'none';

  if (state.showMinimizeButtons && !state.minimizeBtn) {
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
    state.minimizeBtn.onclick = minimizeCanvas;
    state.frame.appendChild(state.minimizeBtn);
  }
}

export function setupCanvas() {
  state.frame = document.createElement('div');
  state.frame.id = 'draggable-frame';
  state.frame.style.cssText = `
    position: fixed; top: 20px; left: 20px; background: black;
    border: 2px solid #555; border-radius: 8px; z-index: 1000;
  `;
  state.canvas = document.createElement('canvas');
  state.canvas.id = 'canvas';
  state.frame.appendChild(state.canvas);
  document.body.appendChild(state.frame);
  state.ctx = state.canvas.getContext('2d');

  const restoreBtn = document.createElement('button');
  restoreBtn.id = 'restore-button';
  restoreBtn.textContent = 'Restore nonogram overlay';
  Object.assign(restoreBtn.style, {
    position: 'absolute',
    bottom: '12px',
    left: '12px',
    zIndex: '10003',
    padding: '6px 12px',
    background: '#00cc44',
    boxShadow: '0 0 8px #00cc44',
    color: 'white',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'none'
  });
  restoreBtn.onclick = () => restoreCanvas();

  const video = [...document.querySelectorAll('video')].reverse().find(v => v.readyState >= 2);
  if (video && video.parentElement) {
    video.parentElement.style.position = 'relative';
    video.parentElement.appendChild(restoreBtn);
  } else {
    document.body.appendChild(restoreBtn);
  }

  if (state.showMinimizeButtons) {
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
    state.minimizeBtn.onclick = minimizeCanvas;
    state.frame.appendChild(state.minimizeBtn);
  }

  state.canvas.addEventListener('mousedown', onCanvasMouseDown);

  state.documentMouseMoveHandler = e => {
    if (state.isDragging) {
      state.frame.style.left = `${e.clientX - state.dragOffsetX}px`;
      state.frame.style.top = `${e.clientY - state.dragOffsetY}px`;
    }
  };
  document.addEventListener('mousemove', state.documentMouseMoveHandler);

  state.documentMouseUpHandler = () => {
    state.isDragging = false;
    state.isMarking = false;
    if (state.currentAction && state.currentAction.length) {
      state.moveHistory.push(state.currentAction);
    }
    state.currentAction = null;
  };
  document.addEventListener('mouseup', state.documentMouseUpHandler);

  state.canvas.addEventListener('mousemove', onCanvasMouseMove);
  state.canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
  });
}

export function updateCanvasSize() {
  const fixedWidth = Math.round(428 * (0.36 / 0.335));
  const fixedHeight = 420;

  state.canvas.width = fixedWidth;
  state.canvas.height = fixedHeight;
  state.roiCanvas.width = state.canvas.width;
  state.roiCanvas.height = state.canvas.height;
  state.canvas.style.width = `${fixedWidth * state.zoomFactor}px`;
  state.canvas.style.height = `${fixedHeight * state.zoomFactor}px`;
  state.frame.style.width = `${fixedWidth * state.zoomFactor}px`;
  state.frame.style.height = `${fixedHeight * state.zoomFactor + 60}px`;

  createGrid();
  updateROI();
}

export function createMainButtons() {
  if (state.activityBtnMonitorId) {
    clearInterval(state.activityBtnMonitorId);
    state.activityBtnMonitorId = null;
  }

  const container = document.createElement('div');
  container.id = 'button-container';
  container.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    padding: 6px 8px;
    z-index: 10001;
    pointer-events: auto;
    background: rgba(0,0,0,0.5);
    border-top: 1px solid #333;
  `;
  state.frame.appendChild(container);

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
      transition: background 0.15s ease, opacity 0.15s ease;
    `;
    btn.onmouseenter = () => {
      btn.style.background = '#f0f0f0';
    };
    btn.onmouseleave = () => {
      btn.style.background = '#fff';
    };
    btn.onclick = onClick;
    return btn;
  };

  state.exportFillBtn = container.appendChild(makeBtn('Export !fill', exportCells));
  state.exportEmptyBtn = container.appendChild(makeBtn('Export !empty', exportWhiteCells));
  container.appendChild(makeBtn('Undo', undoLastAction));

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  container.appendChild(spacer);

  container.appendChild(makeBtn('reset export', exportAllCells));
  container.appendChild(makeBtn('Clean grid', cleanAll));
  container.appendChild(makeBtn('⚙️ Config', () => {
    toggleExtraConfigPanel();
  }));

  const updateActivityBtnStyle = btn => {
    const mins = minutesSinceRedeem();
    if (isNaN(mins) || mins < 30) {
      btn.dataset.alert = '';
      btn.style.background = '#fff';
      btn.style.color = 'black';
      btn.style.border = '1px solid #000';
    } else if (mins >= 30 && mins <= 45) {
      btn.dataset.alert = 'warning';
      btn.style.background = '#ff4444';
      btn.style.color = 'white';
      btn.style.border = '1px solid #cc0000';
    } else {
      btn.dataset.alert = 'overdue';
      btn.style.background = '#b22222';
      btn.style.color = 'white';
      btn.style.border = '1px solid #800000';
    }
  };

  const activityBtn = makeBtn('🎟️ Activity Coupon', async () => {
    if (activityBtn.disabled) return;
    try {
      activityBtn.disabled = true;
      activityBtn.style.opacity = '0.7';
      activityBtn.textContent = '⏳ Redeeming...';
      await redeemAndTrack(() => updateActivityBtnStyle(activityBtn));
    } catch (e) {
      console.error('Redeem error:', e);
    } finally {
      activityBtn.textContent = '🎟️ Activity Coupon';
      activityBtn.disabled = false;
      activityBtn.style.opacity = '1';
      updateActivityBtnStyle(activityBtn);
      state.activityBtnMonitorId = setInterval(() => {
        updateActivityBtnStyle(activityBtn);
      }, 30_000);
    }
  });

  activityBtn.onmouseenter = () => {
    const alertState = activityBtn.dataset.alert;
    if (!alertState) activityBtn.style.background = '#f0f0f0';
    else if (alertState === 'warning') activityBtn.style.background = '#ff2a2a';
    else if (alertState === 'overdue') activityBtn.style.background = '#8b1a1a';
  };
  activityBtn.onmouseleave = () => {
    updateActivityBtnStyle(activityBtn);
  };

  container.appendChild(activityBtn);
  updateActivityBtnStyle(activityBtn);
  state.activityBtnMonitorId = setInterval(() => {
    updateActivityBtnStyle(activityBtn);
  }, 30_000);

  if (state.autosendEnabled) {
    ensureProgressLoop();
  }
}
