// Handles Twitch reward redemption, redeem timing, and guarded export behavior.
import { state } from './state.js';

const TARGET_REWARD_NAME = 'Activity Coupon';
const PANEL_WAIT_TIMEOUT = 800;
const CONFIRM_POLL_INTERVAL = 300;
const CONFIRM_MAX_ATTEMPTS = 30;

export function setLastRedeem(ts = Date.now()) {
  try {
    localStorage.setItem(state.REDEEM_KEY, String(ts));
  } catch (e) {
    console.warn('[Reward Redeemer] setLastRedeem failed:', e);
  }
}

export function getLastRedeem() {
  const v = parseInt(localStorage.getItem(state.REDEEM_KEY) || '0', 10);
  return Number.isFinite(v) ? v : 0;
}

export function minutesSinceRedeem() {
  return (Date.now() - getLastRedeem()) / 60000;
}

export async function redeemAndTrack(onUpdateActivityButton) {
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

export async function guardedExport(fn, ...args) {
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

export async function attemptRedeemCycle() {
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
