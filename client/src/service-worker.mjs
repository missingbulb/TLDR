// Background service worker (ESM). Deliberately tiny — all real logic lives in the side panel and
// the tested pure modules. Its only jobs: make the toolbar click open the side panel, and seed the
// user denylist once.

import { DEFAULT_USER_DENYLIST } from './denylist.mjs';

export const DENYLIST_STORAGE_KEY = 'userDenylist';

async function openPanelOnToolbarClick() {
  try {
    // Chrome 114+: clicking the toolbar action opens the side panel — no in-page gesture needed.
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('sidePanel.setPanelBehavior failed', err);
  }
}

async function seedDenylist() {
  const stored = await chrome.storage.sync.get(DENYLIST_STORAGE_KEY);
  if (!Array.isArray(stored[DENYLIST_STORAGE_KEY])) {
    await chrome.storage.sync.set({ [DENYLIST_STORAGE_KEY]: DEFAULT_USER_DENYLIST });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await openPanelOnToolbarClick();
  await seedDenylist();
});

// setPanelBehavior persists, but re-assert on startup in case it was ever cleared.
chrome.runtime.onStartup.addListener(openPanelOnToolbarClick);
