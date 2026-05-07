// Integrates with Twitch chat, including message sending and autosend cooldown handling.
import { state } from './state.js';

export function sendMessageWithEvent(message) {
  if (!state.currentChat || !state.currentChat.props?.onSendMessage) {
    state.currentChat = getCurrentChat();
  }

  if (state.currentChat?.props?.onSendMessage) {
    state.currentChat.props.onSendMessage(message);
  } else {
    console.error('Chat not available or missing onSendMessage. (Are you on a chat page and logged in?)');
  }
}

export function getCurrentChat() {
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

export function scheduleSend(msg) {
  state.sendQueue.push(msg);
  ensureSendLoop();
  ensureProgressLoop();
}

export function ensureSendLoop() {
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

export function ensureProgressLoop() {
  if (state.progressTimer) return;
  state.progressTimer = setInterval(updateCooldownUI, 100);
}

export function stopProgressLoop() {
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

export function updateCooldownUI() {
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
