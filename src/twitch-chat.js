// Integrates with Twitch chat, including message sending and autosend cooldown handling.
import { state } from './state.js';

export function send_message_with_event(message) {
  if (!state.current_chat || !state.current_chat.props?.onSendMessage) {
    state.current_chat = get_current_chat();
  }

  if (state.current_chat?.props?.onSendMessage) {
    state.current_chat.props.onSendMessage(message);
  } else {
    console.error('Chat not available or missing onSendMessage. (Are you on a chat page and logged in?)');
  }
}

export function get_current_chat() {
  try {
    const chat_node = document.querySelector('section[data-test-selector="chat-room-component-layout"]');
    if (!chat_node) return null;

    const react_instance = get_react_instance(chat_node);
    if (!react_instance) return null;

    const chat_component = search_react_parents(
      react_instance,
      node => node.stateNode && node.stateNode.props && node.stateNode.props.onSendMessage
    );

    return chat_component ? chat_component.stateNode : null;
  } catch (e) {
    console.error('Error accessing chat:', e);
    return null;
  }
}

function get_react_instance(el) {
  for (const k in el) {
    if (k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$')) {
      return el[k];
    }
  }
  return null;
}

function search_react_parents(node, predicate, max_depth = 15, depth = 0) {
  if (!node || depth > max_depth) return null;
  try {
    if (predicate(node)) return node;
  } catch {}
  return search_react_parents(node.return, predicate, max_depth, depth + 1);
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
        send_message_with_event(next);
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
  if (state.sendQueue.length > 0) return 1;
  return 1;
}

export function updateCooldownUI() {
  if (!state.autosendEnabled || (!state.exportFillBtn && !state.exportEmptyBtn)) return;
  const p = cooldownProgress01();
  const ready = Date.now() >= state.nextSendAt && state.sendQueue.length === 0;
  [state.exportFillBtn, state.exportEmptyBtn, state.exportDartBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = !ready;
    btn.style.opacity = ready ? '1' : '0.7';
    btn.style.cursor = ready ? 'pointer' : 'not-allowed';
  });
  setBtnProgress(state.exportFillBtn, p);
  setBtnProgress(state.exportEmptyBtn, p);

  const remain = Math.max(0, state.nextSendAt - Date.now());
  const seconds = Math.ceil(remain / 1000);
  const title = remain > 0 ? `Cooldown: ${seconds}s` : (state.sendQueue.length ? `Queued: ${state.sendQueue.length}` : 'Ready');
  if (state.exportFillBtn) state.exportFillBtn.title = title;
  if (state.exportEmptyBtn) state.exportEmptyBtn.title = title;

  if (!state.autosendEnabled || (state.sendQueue.length === 0 && Date.now() >= state.nextSendAt)) {
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
