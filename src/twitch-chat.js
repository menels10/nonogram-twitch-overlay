// Integrates with Twitch chat: paced queue, delivery confirmation, rate-limit
// recovery, and cooldown tracking shared by nonogram, darts and tamagotchi.
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

// Message groups. By default every group shares one 10s chat cooldown (Twitch
// slow mode is per account), so any message blocks the next one. In subscriber
// mode each group keeps its own cooldown, which lets a dart slip in between two
// nonogram blocks, and tamagotchi commands are not throttled at all.
export const KIND_CELLS = 'cells';
export const KIND_DARTS = 'darts';
export const KIND_OTHER = 'other';

export function messageKind(message) {
  const text = String(message ?? '').trim();
  if (/^!darts(?![a-z0-9_])/i.test(text)) return KIND_DARTS;
  if (/^!(?:fill|empty|clear)(?![a-z0-9_])/i.test(text)) return KIND_CELLS;
  return KIND_OTHER;
}

// When the next message of a group may go out. Default mode ignores the group
// entirely (one shared slot); subscriber mode keeps the groups apart.
function laneEnd(kind) {
  if (!state.subscriberMode) return state.nextSendAt;
  if (kind === KIND_OTHER) return 0;
  return state.nextSendAtByKind[kind] || 0;
}

function laneReadyAt(kind) {
  return Math.max(laneEnd(kind), state.chatUnavailableUntil || 0);
}

// Pushes a group's cooldown forward. Never pulls it back: an external message or
// a rejection can both happen while a longer wait is already running.
function extendLane(kind, until) {
  if (!(until > 0)) return;
  if (state.subscriberMode) {
    if (kind === KIND_OTHER) return; // subscriber mode: tamagotchi never waits
    const current = state.nextSendAtByKind[kind] || 0;
    if (until > current) state.nextSendAtByKind[kind] = until;
    state.nextSendAt = Math.max(
      state.nextSendAtByKind[KIND_CELLS] || 0,
      state.nextSendAtByKind[KIND_DARTS] || 0
    );
    return;
  }
  if (until > state.nextSendAt) state.nextSendAt = until;
}

// Switching modes must never shorten a wait that is already running, so the new
// grouping starts from the longer of the two.
export function setSubscriberMode(enabled) {
  const want = !!enabled;
  if (want === state.subscriberMode) return;
  if (want) {
    [KIND_CELLS, KIND_DARTS].forEach(kind => {
      state.nextSendAtByKind[kind] = Math.max(state.nextSendAtByKind[kind] || 0, state.nextSendAt);
    });
    state.nextSendAt = Math.max(
      state.nextSendAtByKind[KIND_CELLS],
      state.nextSendAtByKind[KIND_DARTS]
    );
  } else {
    state.nextSendAt = Math.max(
      state.nextSendAt,
      state.nextSendAtByKind[KIND_CELLS] || 0,
      state.nextSendAtByKind[KIND_DARTS] || 0
    );
    state.nextSendAtByKind = { [KIND_CELLS]: 0, [KIND_DARTS]: 0, [KIND_OTHER]: 0 };
  }
  state.subscriberMode = want;
  updateCooldownUI();
}

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
// being dropped (and later blocks never overtake it — except tamagotchi
// commands, which are picked first so a pet does not wait behind a grid).
export function processSendQueue(now = Date.now()) {
  const inflight = state.inflightSend;

  if (inflight) {
    if (chatShowsRateLimit()) {
      failInflight(now);
    } else if (now - inflight.at >= SEND_CONFIRM_MS) {
      completeInflight(now);
    }
  }

  if (!state.inflightSend && state.sendQueue.length) {
    startSend(now);
  }

  if (!state.inflightSend && !state.sendQueue.length) {
    if (state.sendLoopTimer) {
      clearInterval(state.sendLoopTimer);
      state.sendLoopTimer = null;
    }
  }

  updateCooldownUI(now);
}

// Index of the next message that may go out right now, or -1. Click-driven
// commands (darts, tamagotchi) are preferred over queued coordinate blocks: they
// are one-shot actions, so they take the next free slot instead of waiting
// behind a pile of blocks. They still obey their cooldown exactly like the rest.
function isExpressKind(kind) {
  return kind === KIND_DARTS || kind === KIND_OTHER;
}

function pickSendable(now) {
  for (let i = 0; i < state.sendQueue.length; i++) {
    const kind = messageKind(state.sendQueue[i]);
    if (isExpressKind(kind) && now >= laneReadyAt(kind)) return i;
  }
  for (let i = 0; i < state.sendQueue.length; i++) {
    if (now >= laneReadyAt(messageKind(state.sendQueue[i]))) return i;
  }
  return -1;
}

function startSend(now) {
  const index = pickSendable(now);
  if (index < 0) return;
  const msg = state.sendQueue[index];
  if (!sendMessageWithEvent(msg)) {
    // Chat not found yet: keep the message queued and try again shortly. This is
    // not a per-command problem, so it delays every group.
    state.chatUnavailableUntil = now + NO_CHAT_RETRY_MS;
    return;
  }
  state.chatUnavailableUntil = 0;
  state.inflightSend = { msg, at: now, index };
}

function removeInflightMessage(inflight) {
  if (!inflight) return;
  if (state.sendQueue[inflight.index] === inflight.msg) {
    state.sendQueue.splice(inflight.index, 1);
    return;
  }
  const at = state.sendQueue.indexOf(inflight.msg);
  if (at >= 0) state.sendQueue.splice(at, 1);
}

function completeInflight(now) {
  const inflight = state.inflightSend;
  const kind = messageKind(inflight?.msg);
  state.inflightSend = null;
  removeInflightMessage(inflight);
  state.sendAttempts = 0;
  state.chatBlockedUntil = 0;
  extendLane(kind, now + state.COOLDOWN_MS);
}

function failInflight(now) {
  const blocked = state.inflightSend?.msg;
  const kind = messageKind(blocked);
  state.inflightSend = null;
  state.sendAttempts += 1;
  const retryAt = now + RETRY_DELAY_MS;
  // extendLane keeps a longer wait that is already running (for example the
  // cooldown started by a tamagotchi command a moment ago) instead of
  // shortening it to 5s.
  extendLane(kind, retryAt);
  state.chatBlockedUntil = Math.max(retryAt, laneEnd(kind));
  const log = state.sendAttempts === 1 ? console.warn : console.log;
  log(
    `[Nonogram] Twitch rejected "${truncate(blocked)}" (attempt ${state.sendAttempts}, ` +
    `slow mode or rate limit); retrying in ${Math.round(RETRY_DELAY_MS / 1000)}s. Pending messages:`,
    state.sendQueue
  );
  if (state.subscriberMode) {
    console.warn(
      '[Nonogram] A message was refused while subscriber mode is on — slow mode may still apply. ' +
      'Turn the option off if the channel throttles your messages anyway.'
    );
  }
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
// the chat slot: it delays the queued messages, but never starts or drains the
// queue. In subscriber mode it only delays its own group, and tamagotchi / other
// commands do not delay anything.
export function noteExternalSend(text = '', now = Date.now()) {
  state.lastExternalSendAt = now;
  const kind = messageKind(text);
  extendLane(kind, now + state.COOLDOWN_MS);

  if (state.inflightSend || state.sendQueue.length) {
    const scope = !state.subscriberMode
      ? `waiting ${Math.round(state.COOLDOWN_MS / 1000)}s before the next queued message.`
      : kind === KIND_OTHER
        ? 'subscriber mode: tamagotchi/manual messages do not delay the queue.'
        : `waiting ${Math.round(state.COOLDOWN_MS / 1000)}s before the next ${kind} message.`;
    console.log(`[Nonogram] Chat message "${truncate(text)}" sent outside the overlay — ${scope}`);
  }
  updateCooldownUI(now);
}

function cooldownProgress01(end, now) {
  if (now >= end) return 1;
  return 1 - (end - now) / state.COOLDOWN_MS;
}

function buttonStateTitle(end, now) {
  const remain = Math.max(0, end - now);
  const seconds = Math.ceil(remain / 1000);
  if (state.chatBlockedUntil > now) {
    return `Twitch blocked the message — retry in ${seconds}s (${state.sendQueue.length} queued)`;
  }
  if (state.inflightSend) return 'Sending…';
  if (remain > 0) return `Cooldown: ${seconds}s`;
  if (state.sendQueue.length) return `Sending (${state.sendQueue.length} left)`;
  return 'Ready';
}

function setButtonReady(btn, ready) {
  if (!btn) return;
  btn.disabled = !ready;
  btn.style.opacity = ready ? '1' : '0.7';
  btn.style.cursor = ready ? 'pointer' : 'not-allowed';
}

export function updateCooldownUI(now = Date.now()) {
  if (!state.exportBtn && !state.exportDartBtn) return;
  const busy = !!state.inflightSend;
  const idle = !busy && state.sendQueue.length === 0;
  const cellsEnd = laneReadyAt(KIND_CELLS);
  const dartsEnd = laneReadyAt(KIND_DARTS);

  // Each button shows the cooldown of its own command group, so in subscriber
  // mode the dart button can be ready while the cells are still cooling down.
  setButtonReady(state.exportBtn, idle && now >= cellsEnd);
  setButtonReady(state.exportDartBtn, idle && now >= dartsEnd);
  setBtnProgress(state.exportBtn, cooldownProgress01(cellsEnd, now));
  setBtnProgress(state.exportDartBtn, cooldownProgress01(dartsEnd, now));

  if (state.exportBtn) {
    const title = buttonStateTitle(cellsEnd, now);
    const base = state.exportBtn.dataset.baseTitle;
    state.exportBtn.title = base ? `${title} — ${base}` : title;
  }
  if (state.exportDartBtn) state.exportDartBtn.title = buttonStateTitle(dartsEnd, now);

  if (state.sendQueue.length === 0 && !busy && now >= Math.max(cellsEnd, dartsEnd)) {
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
