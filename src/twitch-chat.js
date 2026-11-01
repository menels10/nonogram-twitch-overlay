// Integrates with Twitch chat: paced queue, delivery confirmation, rate-limit
// recovery, and cooldown tracking shared by nonogram and dart messages.
import { state } from './state.js';

// Twitch explains a rejected message as short text next to the chat input
// (or as a tooltip): "You are sending messages too quickly.",
// "This chat is running in slow mode. You’re sending messages too quickly.",
// "Your message was not sent ...". Only these concrete phrases count, so
// panels and chat lines cannot stall the queue.
const CHAT_ERROR_RE = /too frequent|too quickly|too fast|slow.?mode|message not sent|message was not sent/i;
// Places Twitch renders that notice, both inline and in tooltips/portals.
const CHAT_ERROR_SELECTORS = [
  '[data-a-target="chat-input-error"]',
  '[data-test-selector="chat-input-error"]',
  '[role="alert"]',
  '[role="tooltip"]',
  '[data-a-target="tooltip-default"]'
];
// How long to wait for an error before treating a message as delivered.
const SEND_CONFIRM_MS = 2500;
// A rejected message (slow mode / "sending messages too quickly") is retried
// at this fixed interval, for as long as it takes, without dropping it.
const RETRY_DELAY_MS = 5_000;
// Retry delay when the chat component could not be found at all.
const NO_CHAT_RETRY_MS = 5_000;

let chatWatchAttached = false;

export function sendMessageWithEvent(message) {
  const chat = resolveChat();
  if (!chat || !chat.props?.onSendMessage) {
    console.error('Chat not available or missing onSendMessage. (Are you on a chat page and logged in?)');
    return false;
  }

  try {
    chat.props.onSendMessage(message);
    return true;
  } catch (error) {
    console.error('Failed to send chat message:', error);
    return false;
  }
}

function resolveChat() {
  if (!state.currentChat || !state.currentChat.props?.onSendMessage) {
    state.currentChat = getCurrentChat();
  }
  return state.currentChat;
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

function truncate(text, max = 60) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function scheduleSend(msg) {
  if (!msg) return;
  ensureChatWatch();
  state.sendQueue.push(msg);
  ensureSendLoop();
  ensureProgressLoop();
}

export function clearSendQueue() {
  state.sendQueue.length = 0;
  state.inflightSend = null;
  state.sendAttempts = 0;
  state.chatBlockedUntil = 0;
  if (state.sendLoopTimer) {
    clearInterval(state.sendLoopTimer);
    state.sendLoopTimer = null;
  }
}

export function ensureSendLoop() {
  ensureChatWatch();
  if (state.sendLoopTimer) return;
  state.sendLoopTimer = setInterval(() => processSendQueue(), 250);
}

export function ensureProgressLoop() {
  if (state.progressTimer) return;
  state.progressTimer = setInterval(updateCooldownUI, 200);
}

export function stopProgressLoop() {
  if (state.progressTimer) {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
  setBtnProgress(state.exportBtn, null);
  [state.exportBtn, state.exportDartBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  });
}

// One step of the send queue. Messages are only removed once Twitch did not
// answer with a rate-limit error, so a blocked block is retried instead of
// being dropped (and later blocks never overtake it).
export function processSendQueue(now = Date.now()) {
  const inflight = state.inflightSend;

  if (inflight) {
    if (chatShowsRateLimit()) {
      failInflight(now);
    } else if (now - inflight.at >= SEND_CONFIRM_MS) {
      completeInflight(now);
    }
  }

  if (!state.inflightSend && state.sendQueue.length && now >= state.nextSendAt) {
    startSend(now);
  }

  if (!state.inflightSend && !state.sendQueue.length && now >= state.nextSendAt) {
    if (state.sendLoopTimer) {
      clearInterval(state.sendLoopTimer);
      state.sendLoopTimer = null;
    }
  }

  updateCooldownUI(now);
}

function startSend(now) {
  const msg = state.sendQueue[0];
  if (!sendMessageWithEvent(msg)) {
    // Chat not found yet: keep the message queued and try again shortly.
    state.nextSendAt = now + NO_CHAT_RETRY_MS;
    return;
  }
  state.inflightSend = { msg, at: now };
}

function completeInflight(now) {
  state.inflightSend = null;
  if (state.sendQueue.length) state.sendQueue.shift();
  state.sendAttempts = 0;
  state.chatBlockedUntil = 0;
  state.nextSendAt = now + state.COOLDOWN_MS;
}

function failInflight(now) {
  const blocked = state.inflightSend?.msg;
  state.inflightSend = null;
  state.sendAttempts += 1;
  state.nextSendAt = now + RETRY_DELAY_MS;
  state.chatBlockedUntil = state.nextSendAt;
  const log = state.sendAttempts === 1 ? console.warn : console.log;
  log(
    `[Nonogram] Twitch rejected "${truncate(blocked)}" (attempt ${state.sendAttempts}, ` +
    `slow mode or rate limit); retrying in ${Math.round(RETRY_DELAY_MS / 1000)}s. Pending messages:`,
    state.sendQueue
  );
}

// Twitch renders its "too quickly" / slow mode notice as short text near the
// chat input, sometimes in a tooltip element. Any visible match blocks the
// queue; chat messages themselves are never considered.
function chatShowsRateLimit() {
  for (const selector of CHAT_ERROR_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      if (matchesChatError(el)) return true;
    }
  }

  // Inline notice: look around the input field first (the usual place), then
  // one and two levels further up in case it lives in a wrapper element.
  const input = document.querySelector(
    'section[data-test-selector="chat-room-component-layout"] textarea, ' +
    'section[data-test-selector="chat-room-component-layout"] [contenteditable="true"], ' +
    'section[data-test-selector="chat-room-component-layout"] [data-test-selector="chat-input"]'
  );
  let scope = input?.parentElement || null;
  for (let depth = 0; scope && depth < 3; depth++) {
    let scanned = 0;
    for (const el of scope.querySelectorAll('p, span, div')) {
      if (scanned++ > 300) break;
      if (el.children.length) continue;
      if (matchesChatError(el)) return true;
    }
    scope = scope.parentElement;
  }

  return false;
}

function matchesChatError(el) {
  if (!el || el.isConnected === false) return false;
  if (el.closest?.('[data-test-selector="chat-line-message"], [data-a-target="chat-line-message"]')) {
    return false;
  }
  const text = (el.textContent || '').trim();
  if (!text || text.length > 300) return false;
  if (!CHAT_ERROR_RE.test(text)) return false;
  return isVisible(el);
}

function isVisible(el) {
  if (!el || el.isConnected === false) return false;
  const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
  return !rect || rect.width > 0 || rect.height > 0;
}

function ensureChatWatch() {
  if (chatWatchAttached) return;
  chatWatchAttached = true;
  document.addEventListener('keydown', handleChatKeydown, true);
  document.addEventListener('click', handleChatClick, true);
}

export function stopChatWatch() {
  if (!chatWatchAttached) return;
  chatWatchAttached = false;
  document.removeEventListener('keydown', handleChatKeydown, true);
  document.removeEventListener('click', handleChatClick, true);
}

function chatInputFrom(el) {
  if (!el) return null;
  const section = el.closest?.('section[data-test-selector="chat-room-component-layout"]');
  if (!section) return null;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable === true) return el;
  return null;
}

function inputText(el) {
  if (!el) return '';
  if (typeof el.value === 'string') return el.value.trim();
  return (el.innerText || el.textContent || '').trim();
}

function findChatInput() {
  return document.querySelector(
    'section[data-test-selector="chat-room-component-layout"] textarea, ' +
    'section[data-test-selector="chat-room-component-layout"] [contenteditable="true"]'
  );
}

function handleChatKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  const input = chatInputFrom(event.target);
  if (!input) return;
  const text = inputText(input);
  if (!text) return;
  noteExternalSend(text, Date.now());
}

function handleChatClick(event) {
  const btn = event.target?.closest?.(
    'button[data-a-target="chat-send-button"], [data-test-selector="chat-input-buttons"] button'
  );
  if (!btn) return;
  const text = inputText(findChatInput());
  if (!text) return;
  noteExternalSend(text, Date.now());
}

// Any other message the user sends (darts, tamagotchi, manual commands) takes
// the chat slot: it only delays the nonogram queue, it never starts or drains it.
export function noteExternalSend(text = '', now = Date.now()) {
  state.lastExternalSendAt = now;
  const until = now + state.COOLDOWN_MS;
  if (until > state.nextSendAt) state.nextSendAt = until;

  if (state.inflightSend || state.sendQueue.length) {
    console.log(
      `[Nonogram] Chat message "${truncate(text)}" sent outside the overlay — ` +
      `waiting ${Math.round(state.COOLDOWN_MS / 1000)}s before the next queued message.`
    );
  }
  updateCooldownUI(now);
}

function cooldownProgress01(now) {
  if (now < state.nextSendAt) return 1 - (state.nextSendAt - now) / state.COOLDOWN_MS;
  return 1;
}

export function updateCooldownUI(now = Date.now()) {
  if (!state.exportBtn && !state.exportDartBtn) return;
  const p = cooldownProgress01(now);
  const busy = !!state.inflightSend;
  const ready = now >= state.nextSendAt && state.sendQueue.length === 0 && !busy;
  [state.exportBtn, state.exportDartBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = !ready;
    btn.style.opacity = ready ? '1' : '0.7';
    btn.style.cursor = ready ? 'pointer' : 'not-allowed';
  });
  setBtnProgress(state.exportBtn, p);

  const remain = Math.max(0, state.nextSendAt - now);
  const seconds = Math.ceil(remain / 1000);
  let title;
  if (state.chatBlockedUntil > now) {
    title = `Twitch blocked the message — retry in ${seconds}s (${state.sendQueue.length} queued)`;
  } else if (busy) {
    title = 'Sending…';
  } else if (remain > 0) {
    title = `Cooldown: ${seconds}s`;
  } else if (state.sendQueue.length) {
    title = `Sending (${state.sendQueue.length} left)`;
  } else {
    title = 'Ready';
  }

  if (state.exportBtn) {
    const base = state.exportBtn.dataset.baseTitle;
    state.exportBtn.title = base ? `${title} — ${base}` : title;
  }
  if (state.exportDartBtn) state.exportDartBtn.title = title;

  if (state.sendQueue.length === 0 && !busy && now >= state.nextSendAt) {
    stopProgressLoop();
  } else {
    // Keeps the countdown running (and the buttons disabled) until the chat
    // slot is free again, including cooldowns started by manual chat messages.
    ensureProgressLoop();
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
