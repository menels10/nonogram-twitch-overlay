// ==UserScript==
// @name         Twitch Nonogram Grid with canvas
// @namespace    http://tampermonkey.net/
// @version      4.57
// @description  Nonogram overlay + status bars + persistent config
// @author       mrpantera+menels+86maylin+a lot of chatgpt + kurotaku codes
// @match        https://www.twitch.tv/goki*
// @grant        none
// @run-at       document-start
// @downloadURL  https://menels10.github.io/nonogram-twitch-overlay/twitch-nonogram-canvas.user.js
// ==/UserScript==
(function () {
  'use strict';

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

  const state = {
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
    documentMouseUpHandler: null,
    dirtyGrid: true,
    cachedVideo: null,
    canvasMouseDownHandler: null,
    canvasMouseMoveHandler: null,
    canvasContextMenuHandler: null
  };

  function initState() {
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

  function saveUIConfig() {
    localStorage.setItem('nonogramUIConfig', JSON.stringify(state.uiConfig));
  }

  const sizeLookup = {
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
    '20_10': { cellSize: 12, anchorX: 1.5, anchorY: 10 },
    '21_2': { cellSize: 17.29, anchorX: 1.5, anchorY: 10 },
    '21_3': { cellSize: 15.96, anchorX: 1.5, anchorY: 10 },
    '21_4': { cellSize: 15.94, anchorX: 1.5, anchorY: 10 },
    '21_5': { cellSize: 14.63, anchorX: 1.5, anchorY: 10 },
    '21_6': { cellSize: 14.67, anchorX: 1.5, anchorY: 10 },
    '21_7': { cellSize: 14.66, anchorX: 1.5, anchorY: 10 },
    '21_8': { cellSize: 13.27, anchorX: 1.5, anchorY: 10 },
    '21_9': { cellSize: 13.27, anchorX: 1.5, anchorY: 10 },
    '21_10': { cellSize: 11.97, anchorX: 1.5, anchorY: 10 },
    '21_11': { cellSize: 11.98, anchorX: 1.5, anchorY: 10 },
    '22_1': { cellSize: 15.95, anchorX: 1.5, anchorY: 10 },
    '22_2': { cellSize: 14.63, anchorX: 1.5, anchorY: 10 },
    '22_3': { cellSize: 14.64, anchorX: 1.5, anchorY: 10 },
    '22_4': { cellSize: 13.28, anchorX: 1.5, anchorY: 10 },
    '22_5': { cellSize: 13.28, anchorX: 1.5, anchorY: 10 },
    '22_6': { cellSize: 11.95, anchorX: 1.5, anchorY: 10 },
    '22_7': { cellSize: 11.98, anchorX: 1.5, anchorY: 10 },
    '22_8': { cellSize: 10.64, anchorX: 1.5, anchorY: 10 },
    '22_9': { cellSize: 10.64, anchorX: 1.5, anchorY: 10 },
    '22_10': { cellSize: 9.3, anchorX: 1.5, anchorY: 10 },
    '22_11': { cellSize: 9.29, anchorX: 1.5, anchorY: 10 },
    '23_1': { cellSize: 14.63, anchorX: 1.5, anchorY: 10 },
    '23_2': { cellSize: 14.62, anchorX: 1.5, anchorY: 10 },
    '23_3': { cellSize: 13.29, anchorX: 1.5, anchorY: 10 },
    '23_4': { cellSize: 13.32, anchorX: 1.5, anchorY: 10 },
    '23_5': { cellSize: 11.96, anchorX: 1.5, anchorY: 10 },
    '23_6': { cellSize: 11.95, anchorX: 1.5, anchorY: 10 },
    '23_7': { cellSize: 10.62, anchorX: 1.5, anchorY: 10 },
    '23_8': { cellSize: 10.65, anchorX: 1.5, anchorY: 10 },
    '23_9': { cellSize: 9.26, anchorX: 1.5, anchorY: 10 },
    '23_10': { cellSize: 9.3, anchorX: 1.5, anchorY: 10 },
    '23_11': { cellSize: 7.96, anchorX: 1.5, anchorY: 10 },
    '23_12': { cellSize: 7.97, anchorX: 1.5, anchorY: 10 },
  };

  const statusRegions = [
    { sx: 200, sy: 980, sw: 250, sh: 70 },
    { sx: 500, sy: 980, sw: 250, sh: 70 },
    { sx: 800, sy: 980, sw: 250, sh: 70 }
  ];

  function getKey(sz, cc) {
    return `${sz}x${cc}`;
  }

  function getLayoutSettings(size, colClueLength) {
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

  function saveLayout() {
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

  function loadLayout() {
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

  function clearRenderHandle() {
    if (!state.renderHandle) return;
    if (typeof state.renderHandle === 'number') {
      cancelAnimationFrame(state.renderHandle);
    } else {
      clearTimeout(state.renderHandle);
    }
    state.renderHandle = null;
  }

  // Integrates with Twitch chat, including message sending and autosend cooldown handling.

  function sendMessageWithEvent(message) {
    if (!state.currentChat || !state.currentChat.props?.onSendMessage) {
      state.currentChat = getCurrentChat();
    }

    if (state.currentChat?.props?.onSendMessage) {
      state.currentChat.props.onSendMessage(message);
    } else {
      console.error('Chat not available or missing onSendMessage. (Are you on a chat page and logged in?)');
    }
  }

  function getCurrentChat() {
    try {
      const chatNode = document.querySelector('section[data-test-selector="chat-room-component-layout"]');
      if (!chatNode) return null;

      const reactInstance = getReactInstance(chatNode);
      if (!reactInstance) return null;

      const chatComponent = searchReactParents(
        reactInstance,
        node => node.stateNode && node.stateNode.props && node.stateNode.props.onSendMessage
      );

      return chatComponent ? chatComponent.stateNode : null;
    } catch (e) {
      console.error('Error accessing chat:', e);
      return null;
    }
  }

  function getReactInstance(el) {
    for (const k of Object.keys(el)) {
      if (k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$')) {
        return el[k];
      }
    }
    return null;
  }

  function searchReactParents(node, predicate, maxDepth = 15, depth = 0) {
    if (!node || depth > maxDepth) return null;
    try {
      if (predicate(node)) return node;
    } catch {}
    return searchReactParents(node.return, predicate, maxDepth, depth + 1);
  }

  function scheduleSend(msg) {
    state.sendQueue.push(msg);
    ensureSendLoop();
    ensureProgressLoop();
  }

  function ensureSendLoop() {
    if (state.sendLoopTimer) return;
    state.sendLoopTimer = setInterval(() => {
      const now = Date.now();
      if (state.sendQueue.length > 0 && now >= state.nextSendAt) {
        const next = state.sendQueue.shift();
        try {
          sendMessageWithEvent(next);
        } catch (e) {
          console.error(e);
        }
        state.nextSendAt = now + state.COOLDOWN_MS;
      }
      if (state.sendQueue.length === 0 && now >= state.nextSendAt) {
        clearInterval(state.sendLoopTimer);
        state.sendLoopTimer = null;
      }
    }, 250);
  }

  function ensureProgressLoop() {
    if (state.progressTimer) return;
    state.progressTimer = setInterval(updateCooldownUI, 200);
  }

  function stopProgressLoop() {
    if (state.progressTimer) {
      clearInterval(state.progressTimer);
      state.progressTimer = null;
    }
    setBtnProgress(state.exportFillBtn, null);
    setBtnProgress(state.exportEmptyBtn, null);
  }

  function cooldownProgress01() {
    const now = Date.now();
    if (now < state.nextSendAt) return 1 - (state.nextSendAt - now) / state.COOLDOWN_MS;
    return 1;
  }

  function updateCooldownUI() {
    if (!state.autosendEnabled || (!state.exportFillBtn && !state.exportEmptyBtn)) return;
    const now = Date.now();
    const p = cooldownProgress01();
    const ready = now >= state.nextSendAt && state.sendQueue.length === 0;
    [state.exportFillBtn, state.exportEmptyBtn, state.exportDartBtn].forEach(btn => {
      if (!btn) return;
      btn.disabled = !ready;
      btn.style.opacity = ready ? '1' : '0.7';
      btn.style.cursor = ready ? 'pointer' : 'not-allowed';
    });
    setBtnProgress(state.exportFillBtn, p);
    setBtnProgress(state.exportEmptyBtn, p);

    const remain = Math.max(0, state.nextSendAt - now);
    const seconds = Math.ceil(remain / 1000);
    const title = remain > 0 ? `Cooldown: ${seconds}s` : (state.sendQueue.length ? `Queued: ${state.sendQueue.length}` : 'Ready');
    if (state.exportFillBtn) state.exportFillBtn.title = title;
    if (state.exportEmptyBtn) state.exportEmptyBtn.title = title;

    if (!state.autosendEnabled || (state.sendQueue.length === 0 && now >= state.nextSendAt)) {
      stopProgressLoop();
    }
  }

  function setBtnProgress(btn, p) {
    if (!btn) return;
    if (p == null) {
      btn.style.backgroundImage = '';
      return;
    }
    const pct = Math.max(0, Math.min(1, p)) * 100;
    btn.style.backgroundImage = `linear-gradient(to right, rgba(0,200,0,0.35) ${pct}%, transparent ${pct}%)`;
  }

  // Handles Twitch reward redemption, redeem timing, and guarded export behavior.

  const TARGET_REWARD_NAME = 'Activity Coupon';
  const PANEL_WAIT_TIMEOUT = 800;
  const CONFIRM_POLL_INTERVAL = 300;
  const CONFIRM_MAX_ATTEMPTS = 30;

  function setLastRedeem(ts = Date.now()) {
    try {
      localStorage.setItem(state.REDEEM_KEY, String(ts));
    } catch (e) {
      console.warn('[Reward Redeemer] setLastRedeem failed:', e);
    }
  }

  function getLastRedeem() {
    const v = parseInt(localStorage.getItem(state.REDEEM_KEY) || '0', 10);
    return Number.isFinite(v) ? v : 0;
  }

  function minutesSinceRedeem() {
    return (Date.now() - getLastRedeem()) / 60000;
  }

  async function redeemAndTrack(onUpdateActivityButton) {
    if (state.redeemBusy) {
      console.log('[Reward Redeemer] Another redeem is in progress — skipping.');
      return;
    }
    state.redeemBusy = true;
    try {
      console.log('[Reward Redeemer] Redeeming reward...');
      const success = await attemptRedeemCycle();
      if (success) {
        setLastRedeem();
        state.lastGuardRedeem = Date.now();
        if (typeof onUpdateActivityButton === 'function') {
          try {
            onUpdateActivityButton();
          } catch {}
        }
      } else {
        console.log('[Reward Redeemer] Redeem attempt did not complete (timed out or no button).');
      }
    } finally {
      state.redeemBusy = false;
    }
  }

  async function guardedExport(fn, ...args) {
    if (!state.guardExport) {
      return fn(...args);
    }

    const minutes = minutesSinceRedeem();
    const now = Date.now();

    if (minutes > 55) {
      if (now - state.lastGuardRedeem < 60_000) {
        console.log('[Reward Redeemer] Guarded export skipped — redeem already attempted recently.');
        return;
      }

      console.log('[Reward Redeemer] Guarded export requires redeem...');
      state.lastGuardRedeem = now;
      await redeemAndTrack();
    }

    return fn(...args);
  }

  function findPanelButton() {
    return document.querySelector('button[aria-label="Bits and Points Balances"]') ||
      document.querySelector('[data-test-selector="community-points-summary"] button') ||
      document.querySelector('button[data-test-selector="community-points-summary-button"]');
  }

  function openPanel() {
    const btn = findPanelButton();
    if (!btn) return false;
    btn.click();
    return true;
  }

  function waitForAnySelector(selectors, timeout = 3000) {
    const start = Date.now();
    return new Promise(resolve => {
      const tick = () => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return resolve(el);
        }
        if (Date.now() - start >= timeout) return resolve(null);
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  function clickFirstLayerInPanel() {
    const img = document.querySelector(`img[alt="${TARGET_REWARD_NAME}"]`);
    if (img) {
      const button = img.closest('button');
      if (button) {
        button.click();
        return true;
      }
    }
    return false;
  }

  function pollAndClickConfirm() {
    return new Promise(resolve => {
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        const confirmButton = document.querySelector('button:has(p[data-test-selector="RewardText"])');

        if (confirmButton) {
          const ariaAncestor = confirmButton.closest('[aria-hidden]');
          if (!ariaAncestor || ariaAncestor.getAttribute('aria-hidden') !== 'true') {
            try {
              confirmButton.click();
            } catch {}
            clearInterval(poll);
            resolve(true);
            return;
          }
        }

        if (attempts >= CONFIRM_MAX_ATTEMPTS) {
          clearInterval(poll);
          resolve(false);
        }
      }, CONFIRM_POLL_INTERVAL);
    });
  }

  async function attemptRedeemCycle() {
    const opened = openPanel();
    if (!opened) return false;

    const rewardPanel = await waitForAnySelector(
      ['#channel-points-reward-center-body', '.rewards-list', '.reward-list-item'],
      PANEL_WAIT_TIMEOUT
    );
    if (!rewardPanel) return false;

    const firstClicked = clickFirstLayerInPanel();
    if (!firstClicked) return false;

    await new Promise(resolve => setTimeout(resolve, 400));
    const confirmed = await pollAndClickConfirm();
    return !!confirmed;
  }

  // Owns nonogram state, geometry, drawing, exports, and canvas interaction logic.

  let updateCanvasSizeRef$1;

  const COL_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
  const CELL_EMPTY = 0;
  const CELL_FILLED = 1;
  const CELL_MARKED = 2;

  function colLetter(index) {
    return COL_LETTERS[index];
  }

  function safeClipboardWrite(text) {
    try {
      navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn('Clipboard write failed:', error);
      alert(text);
    }
  }

  function configureNonogramGrid({ updateCanvasSize }) {
    updateCanvasSizeRef$1 = updateCanvasSize;
  }

  function initCells() {
    state.cellStates = Array.from({ length: state.size }, () => Array(state.size).fill(CELL_EMPTY));
    state.lastExported = new Set();
    state.lastExportedWhite = new Set();
    state.geometryCache = null;
    state.dirtyGrid = true;
    resetClueDashes();
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  async function exportDartCommand() {
    let msg = '!darts';
    const chars = [...msg];
    chars[state.lastDartExportIndex] = chars[state.lastDartExportIndex].toUpperCase();
    msg = chars.join('');
    state.lastDartExportIndex++;
    if (state.lastDartExportIndex >= msg.length) {
      state.lastDartExportIndex = 1;
    }
    if (state.autosendEnabled) {
      scheduleSend(msg);
    } else {
      safeClipboardWrite(msg);
    }
  }

  function addColDash(col, pos, clueH) {
    if (col < 0 || col >= state.size) return;
    if (!Array.isArray(state.colDashes[col])) state.colDashes[col] = [];
    state.colDashes[col].push(clamp(pos, 0, clueH));
    state.dirtyGrid = true;
  }

  function removeNearestColDash(col, pos, threshold = 10) {
    const arr = state.colDashes[col];
    if (!arr || !arr.length) return;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i] - pos);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best !== -1 && bestDist <= threshold) {
      arr.splice(best, 1);
      state.dirtyGrid = true;
    }
  }

  function addRowDash(row, canvasX) {
    if (row < 0 || row >= state.size) return;
    if (!Array.isArray(state.rowDashes[row])) state.rowDashes[row] = [];
    state.rowDashes[row].push(canvasX);
    state.dirtyGrid = true;
  }

  function removeNearestRowDash(row, canvasX, threshold = 10) {
    const arr = state.rowDashes[row];
    if (!arr || !arr.length) return;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i] - canvasX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best !== -1 && bestDist <= threshold) {
      arr.splice(best, 1);
      state.dirtyGrid = true;
    }
  }

  function computeGridGeometry() {
    const cacheKey = [
      state.size,
      state.colClueCount,
      state.fineTune,
      state.anchorX,
      state.anchorY,
      state.canvas?.width,
      state.canvas?.height
    ].join(':');

    if (state.geometryCache?.key === cacheKey) {
      return state.geometryCache.value;
    }

    state.ctx.font = 'bold 30px Arial';
    const clueW = state.ctx.measureText('0').width;
    const clueH = 30 * state.colClueCount + 5;

    const layout = getLayoutSettings(state.size, state.colClueCount);
    let cellSize;
    if (layout) {
      const defaultCellSize = layout.cellSize;
      cellSize = (defaultCellSize * state.size + state.fineTune) / state.size;
    } else {
      const gridSize = Math.min(state.canvas.width - clueW, state.canvas.height - clueH);
      cellSize = (gridSize + state.fineTune) / state.size;
    }

    const ox = state.canvas.width - cellSize * state.size - state.anchorX;
    const oy = state.canvas.height - cellSize * state.size - state.anchorY;

    const geometry = { clueW, clueH, cellSize, ox, oy };
    state.geometryCache = { key: cacheKey, value: geometry };
    return geometry;
  }

  function resetClueDashes() {
    state.rowDashes = Array.from({ length: state.size }, () => []);
    state.colDashes = Array.from({ length: state.size }, () => []);
  }

  async function cleanAll() {
    return guardedExport(() => {
      initCells();
      createGrid();
      exportClearCommand();
    });
  }

  function exportCellsInner() {
    const coords = [];
    state.cellStates.forEach((row, r) => {
      row.forEach((s, c) => {
          if (s === 1) {
            const coord = `${colLetter(c)}${r + 1}`;
            if (!state.lastExported.has(coord)) {
              coords.push(coord);
              state.lastExported.add(coord);
          }
        }
      });
    });
      if (coords.length) {
        const msg = `!fill ${coords.join(' ')}`;
        if (state.autosendEnabled) {
          scheduleSend(msg);
        } else {
          safeClipboardWrite(msg);
        }
      }
  }

  function exportAllCellsInner(mode = 'black') {
    state.lastExported.clear();
    state.lastExportedWhite.clear();

    const coords = [];
    if (mode === 'black') {
      state.cellStates.forEach((row, r) => {
        row.forEach((s, c) => {
          if (s === 1) {
            const coord = `${colLetter(c)}${r + 1}`;
            coords.push(coord);
            state.lastExported.add(coord);
          }
        });
      });
      if (coords.length) {
        const msg = `!fill ${coords.join(' ')}`;
        if (state.autosendEnabled) scheduleSend(msg);
        else safeClipboardWrite(msg);
      }
    } else if (mode === 'white') {
      state.cellStates.forEach((row, r) => {
        row.forEach((s, c) => {
          if (s === CELL_MARKED) {
            const coord = `${colLetter(c)}${r + 1}`;
            coords.push(coord);
            state.lastExportedWhite.add(coord);
          }
        });
      });
      if (coords.length) {
        const msg = `!empty ${coords.join(' ')}`;
        if (state.autosendEnabled) scheduleSend(msg);
        else safeClipboardWrite(msg);
      }
    }
  }

  function exportWhiteCellsInner() {
    const coords = [];
    state.cellStates.forEach((row, r) => {
      row.forEach((s, c) => {
        if (s === 2) {
          const coord = `${colLetter(c)}${r + 1}`;
          if (!state.lastExportedWhite.has(coord)) {
            coords.push(coord);
            state.lastExportedWhite.add(coord);
          }
        }
      });
    });
    if (coords.length) {
      const msg = `!empty ${coords.join(' ')}`;
      if (state.autosendEnabled) {
        scheduleSend(msg);
      } else {
        safeClipboardWrite(msg);
      }
    }
  }

  function exportCells() {
    return guardedExport(exportCellsInner);
  }

  function exportAllCells(mode) {
    return guardedExport(exportAllCellsInner, mode);
  }

  function exportWhiteCells() {
    return guardedExport(exportWhiteCellsInner);
  }

  function exportClearCommand() {
    const ranges = [];
    for (let c = 0; c < state.size; c++) {
      const col = colLetter(c);
      ranges.push(`${col}1-${col}${state.size}`);
    }
    const clearCmd = `!clear ${ranges.join(',')}`;
    safeClipboardWrite(clearCmd);
  }

  function createGrid() {
    const { clueH, cellSize, ox, oy } = computeGridGeometry();

    if ((state.hoveredRow >= 0 && state.hoveredRow < state.size) || (state.hoveredCol >= 0 && state.hoveredCol < state.size)) {
      state.ctx.fillStyle = 'rgba(100, 150, 255, 0.25)';

      if (state.hoveredRow >= 0) {
        const y = oy + state.hoveredRow * cellSize;
        state.ctx.fillRect(ox, y, cellSize * state.size, cellSize);
        if (ox > 0) state.ctx.fillRect(0, y, ox, cellSize);
      }

      if (state.hoveredCol >= 0) {
        const x = ox + state.hoveredCol * cellSize;
        state.ctx.fillRect(x, oy, cellSize, cellSize * state.size);
        state.ctx.fillRect(x, oy - clueH, cellSize, clueH);
      }
    }

    const dashH = 3;

    {
      const dashW = cellSize / 3;
      state.ctx.fillStyle = '#ffeb3b';
      for (let c = 0; c < state.size; c++) {
        const colX = ox + c * cellSize + cellSize / 2;
        const baseY = oy - clueH;
        const list = state.colDashes[c] || [];
        for (const pos of list) {
          const y = clamp(baseY + pos - dashH / 2, baseY, oy - dashH);
          state.ctx.fillRect(colX - dashW / 2, y, dashW, dashH);
        }
      }
    }

    {
      const dashW = cellSize / 4;
      state.ctx.fillStyle = '#ffeb3b';
      for (let r = 0; r < state.size; r++) {
        const rowTop = oy + r * cellSize;
        const list = state.rowDashes[r] || [];
        for (const canvasX of list) {
          const xDraw = Math.max(0, Math.min(canvasX, ox));
          const yDash = rowTop + (cellSize - dashH) / 2;
          state.ctx.fillRect(xDraw - dashW / 2, yDash, dashW, dashH);
        }
      }
    }

    const filledColor = state.useBlueFill ? 'rgba(50, 50, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    const markedColor = 'rgba(255, 255, 255, 0.6)';

    const gridRight = ox + state.size * cellSize;
    const gridBottom = oy + state.size * cellSize;

    state.ctx.strokeStyle = 'cyan';
    state.ctx.lineWidth = 1;
    state.ctx.beginPath();
    for (let i = 0; i <= state.size; i++) {
      const x = ox + i * cellSize;
      const y = oy + i * cellSize;
      state.ctx.moveTo(x, oy);
      state.ctx.lineTo(x, gridBottom);
      state.ctx.moveTo(ox, y);
      state.ctx.lineTo(gridRight, y);
    }
    state.ctx.stroke();

    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const val = state.cellStates[r][c];
        if (val === CELL_EMPTY) continue;
        const x = ox + c * cellSize;
        const y = oy + r * cellSize;
        state.ctx.fillStyle = val === CELL_FILLED ? filledColor : markedColor;
        state.ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
    state.dirtyGrid = false;
  }

  function onCanvasMouseDown(e) {
    e.preventDefault();

    const rect = state.canvas.getBoundingClientRect();
    const scaleX = state.canvas.width / rect.width;
    const scaleY = state.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const { clueH, cellSize, ox, oy } = computeGridGeometry();
    const yOverGrid = y >= oy && y < oy + state.size * cellSize;

    const inTopClues = x >= ox && x < ox + state.size * cellSize && y >= oy - clueH && y < oy;
    if (inTopClues) {
      const col = Math.floor((x - ox) / cellSize);
      if (col >= 0 && col < state.size) {
        const pos = y - (oy - clueH);
        if (e.button === 0) addColDash(col, pos, clueH);
        else if (e.button === 2) removeNearestColDash(col, pos, 10);
        createGrid();
        return;
      }
    }

    const inLeftClues = x < ox && yOverGrid;
    if (inLeftClues) {
      const row = Math.floor((y - oy) / cellSize);
      if (row >= 0 && row < state.size) {
        if (e.button === 0) addRowDash(row, x);
        else if (e.button === 2) removeNearestRowDash(row, x, 10);
        createGrid();
        return;
      }
    }

    const c = Math.floor((x - ox) / cellSize);
    const r = Math.floor((y - oy) / cellSize);

    if (r >= 0 && r < state.size && c >= 0 && c < state.size) {
      state.isMarking = true;
      state.markValue = e.button === 0 ? CELL_FILLED : CELL_MARKED;
      state.eraseMode = state.cellStates[r][c] === state.markValue;

      const prevValue = state.cellStates[r][c];
      const newValue = state.eraseMode ? CELL_EMPTY : state.markValue;
      state.cellStates[r][c] = newValue;
      state.currentAction = [{ row: r, col: c, previous: prevValue, newValue }];
      createGrid();
    } else {
      state.isDragging = true;
      state.dragOffsetX = e.clientX - state.frame.offsetLeft;
      state.dragOffsetY = e.clientY - state.frame.offsetTop;
    }
  }

  function onCanvasMouseMove(e) {
    const rect = state.canvas.getBoundingClientRect();
    const scaleX = state.canvas.width / rect.width;
    const scaleY = state.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const { clueH, cellSize, ox, oy } = computeGridGeometry();
    const c = Math.floor((x - ox) / cellSize);
    const r = Math.floor((y - oy) / cellSize);

    let newRow = -1;
    let newCol = -1;

    const yOverGrid = y >= oy && y < oy + state.size * cellSize;
    if (yOverGrid) {
      const ry = Math.floor((y - oy) / cellSize);
      if (ry >= 0 && ry < state.size) newRow = ry;
    }

    const inTopClues = x >= ox && x < ox + state.size * cellSize && y >= oy - clueH && y < oy;
    if (inTopClues) {
      const col = Math.floor((x - ox) / cellSize);
      if (col >= 0 && col < state.size) newCol = col;
    }

    if (r >= 0 && r < state.size && c >= 0 && c < state.size) {
      newRow = r;
      newCol = c;
    }

    const hoverChanged = newRow !== state.hoveredRow || newCol !== state.hoveredCol;
    state.hoveredRow = newRow;
    state.hoveredCol = newCol;

    let cellChanged = false;
    if (state.isMarking && newRow >= 0 && newCol >= 0) {
      const targetValue = state.eraseMode ? CELL_EMPTY : state.markValue;
      if (state.cellStates[newRow][newCol] !== targetValue) {
        if (!state.currentAction) state.currentAction = [];
        state.currentAction.push({
          row: newRow,
          col: newCol,
          previous: state.cellStates[newRow][newCol],
          newValue: targetValue
        });
        state.cellStates[newRow][newCol] = targetValue;
        cellChanged = true;
      }
    }

    if (hoverChanged || cellChanged) {
      createGrid();
    }
  }

  function undoLastAction() {
    if (!state.moveHistory.length) return;
    const lastAction = state.moveHistory.pop();
    lastAction.forEach(({ row, col, previous, newValue }) => {
      const coord = `${colLetter(col)}${row + 1}`;
      if (newValue === CELL_FILLED) state.lastExported.delete(coord);
      if (newValue === CELL_MARKED) state.lastExportedWhite.delete(coord);
      state.cellStates[row][col] = previous;
    });
    createGrid();
  }

  function decrementSize() {
    state.size = Math.max(1, state.size - 1);
    loadLayout();
    initCells();
    updateCanvasSizeRef$1();
  }

  function incrementSize() {
    state.size++;
    loadLayout();
    initCells();
    updateCanvasSizeRef$1();
  }

  function decrementCols() {
    state.colClueCount = Math.max(1, state.colClueCount - 1);
    loadLayout();
    initCells();
    updateCanvasSizeRef$1();
  }

  function incrementCols() {
    state.colClueCount++;
    loadLayout();
    initCells();
    updateCanvasSizeRef$1();
  }

  function decrementFineTune() {
    state.fineTune--;
    state.geometryCache = null;
    saveLayout();
    updateCanvasSizeRef$1();
  }

  function incrementFineTune() {
    state.fineTune++;
    state.geometryCache = null;
    saveLayout();
    updateCanvasSizeRef$1();
  }

  function resetSizeDefaults() {
    saveLayout();
    state.size = 4;
    state.colClueCount = 1;
    initCells();
    updateCanvasSizeRef$1();
  }

  // Builds the side controls, extra settings panel, and clickable status preview canvases.

  const MINIMIZE_BUTTON_STYLE$1 = {
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

  function createMinimizeButton$1(onClick) {
    const button = document.createElement('button');
    button.textContent = 'X';
    Object.assign(button.style, MINIMIZE_BUTTON_STYLE$1);
    button.onclick = onClick;
    return button;
  }

  let updateCanvasSizeRef;
  let createGridRef;
  let minimizeCanvasRef;

  function configureStatusControls({ updateCanvasSize, createGrid, minimizeCanvas }) {
    updateCanvasSizeRef = updateCanvasSize;
    createGridRef = createGrid;
    minimizeCanvasRef = minimizeCanvas;
  }

  function createControlPanel() {
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

  function createExtraConfigPanel() {
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
            state.minimizeBtn = createMinimizeButton$1(minimizeCanvasRef);
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

  function toggleExtraConfigPanel() {
    const panel = document.getElementById('extra-config-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  function createStatusContainer() {
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

  function createControlAndStatus() {
    createControlPanel();
    createStatusContainer();
  }

  // Manages the overlay frame, canvas rendering, ROI capture, and main action buttons.

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

  function createMinimizeButton(onClick) {
    const button = document.createElement('button');
    button.textContent = 'X';
    Object.assign(button.style, MINIMIZE_BUTTON_STYLE);
    button.onclick = onClick;
    return button;
  }

  function getVideoElement() {
    if (state.cachedVideo && state.cachedVideo.readyState >= 2 && !state.cachedVideo.paused) {
      return state.cachedVideo;
    }
    state.cachedVideo = [...document.querySelectorAll('video')].reverse().find(v => v.readyState >= 2) || null;
    return state.cachedVideo;
  }

  function sharpen(ctx) {
    ctx.filter = 'contrast(1.2) saturate(1.05)';
  }

  function updateROI() {
    const video = getVideoElement();
    if (!video || state.isPaused) return;

    state.roiCtx.clearRect(0, 0, state.roiCanvas.width, state.roiCanvas.height);

    const actualWidth = video.videoWidth;
    const actualHeight = video.videoHeight;
    const roiWidth = actualWidth * state.roiWidthPercent;
    const roiHeight = actualHeight * state.roiHeightPercent;
    const roiX = actualWidth - roiWidth;
    const roiY = actualHeight - roiHeight;

    if (state.sharpeningEnabled) {
      sharpen(state.roiCtx);
    }
    state.roiCtx.drawImage(video, roiX, roiY, roiWidth, roiHeight, 0, 0, state.roiCanvas.width, state.roiCanvas.height);
    state.roiCtx.filter = 'none';
  }

  function drawStatus() {
    const video = getVideoElement();
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

  function render() {
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

  function minimizeCanvas() {
    state.isMinimized = true;
    clearRenderHandle();

    state.canvas.style.display = 'none';
    state.frame.style.height = '0px';
    state.frame.style.width = '0px';

    const ctrl = document.getElementById('control-container');
    if (ctrl) ctrl.style.display = 'none';

    const btns = document.getElementById('button-container');
    if (btns) btns.style.display = 'none';

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

  function restoreCanvas() {
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
      state.minimizeBtn = createMinimizeButton(minimizeCanvas);
      state.frame.appendChild(state.minimizeBtn);
    }
  }

  function setupCanvas() {
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

    const video = getVideoElement();
    if (video && video.parentElement) {
      video.parentElement.style.position = 'relative';
      video.parentElement.appendChild(restoreBtn);
    } else {
      document.body.appendChild(restoreBtn);
    }

    if (state.showMinimizeButtons) {
      state.minimizeBtn = createMinimizeButton(minimizeCanvas);
      state.frame.appendChild(state.minimizeBtn);
    }

    state.canvasMouseDownHandler = onCanvasMouseDown;
    state.canvas.addEventListener('mousedown', state.canvasMouseDownHandler);

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

    state.canvasMouseMoveHandler = onCanvasMouseMove;
    state.canvas.addEventListener('mousemove', state.canvasMouseMoveHandler);
    state.canvasContextMenuHandler = e => { e.preventDefault(); };
    state.canvas.addEventListener('contextmenu', state.canvasContextMenuHandler);
  }

  function updateCanvasSize() {
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

  function createMainButtons() {
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
    state.buttonContainer = container;

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

  // Bootstraps the userscript, wires the grouped modules together, and handles cleanup.

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

  function bootstrap() {
    window.addEventListener('beforeunload', cleanup);
    if (document.readyState === 'complete') {
      onLoad();
      return;
    }

    window.addEventListener('load', onLoad, { once: true });
  }

  // Userscript entrypoint that starts the modular app after bundling.

  bootstrap();

})();
