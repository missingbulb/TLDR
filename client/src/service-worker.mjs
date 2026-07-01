// Background service worker (ESM). Deliberately tiny — all real logic lives in the side panel and
// the tested pure modules. Its jobs: drive the toolbar-icon toggle (issue #25), and seed the denylist.
//
// TOOLBAR ICON TOGGLE (issue #25 — owner behaviour):
//   - pane CLOSED → clicking the icon shows the category MENU popup (src/category-menu.html), which
//     picks a category and opens the pane to it.
//   - pane OPEN   → clicking the icon just CLOSES the pane.
// MV3 can't do both from one static action (a popup suppresses onClicked, and there's no
// is-open/close API), so we track pane-open state via a Port the panel opens, and SWAP the action's
// popup: while a pane is open we clear the popup so a click fires `onClicked` (→ we tell the pane to
// close); while none is open the popup is the category menu. Panel-open tracking is best-effort and
// window-agnostic (the common case is one window); the menu opens the pane per the active tab.

import { DEFAULT_USER_DENYLIST } from './denylist.mjs';

export const DENYLIST_STORAGE_KEY = 'userDenylist';
const CATEGORY_MENU_POPUP = 'src/category-menu.html';
const PANEL_PORT = 'panel';

// The live connections from open side panels. Non-empty ⇒ a pane is open somewhere.
const panelPorts = new Set();

// Reflect pane-open state onto the action: some pane open ⇒ clear the popup so a click toggles closed;
// none open ⇒ the popup is the category menu so a click lets you choose + open.
async function reflectPopup() {
  try {
    await chrome.action.setPopup({ popup: panelPorts.size ? '' : CATEGORY_MENU_POPUP });
  } catch (err) {
    console.warn('action.setPopup failed', err);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT) return;
  panelPorts.add(port);
  reflectPopup();
  port.onDisconnect.addListener(() => {
    panelPorts.delete(port);
    reflectPopup();
  });
});

// Fires only while the popup is cleared — i.e. a pane is open — so a click means "close the pane".
// There's no close API, so ask the pane(s) to close themselves (the panel calls window.close()).
chrome.action.onClicked.addListener(() => {
  for (const port of panelPorts) {
    try {
      port.postMessage({ type: 'close' });
    } catch {
      /* a stale port; its onDisconnect will clean it up */
    }
  }
});

async function seedDenylist() {
  const stored = await chrome.storage.sync.get(DENYLIST_STORAGE_KEY);
  if (!Array.isArray(stored[DENYLIST_STORAGE_KEY])) {
    await chrome.storage.sync.set({ [DENYLIST_STORAGE_KEY]: DEFAULT_USER_DENYLIST });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await reflectPopup(); // default (no pane open): the icon opens the category menu
  await seedDenylist();
});

// Re-assert the default popup on startup in case it was ever cleared while no pane is open.
chrome.runtime.onStartup.addListener(reflectPopup);
