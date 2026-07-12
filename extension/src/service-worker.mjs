// Background service worker (ESM). Deliberately tiny — all real logic lives in the side panel and
// the tested pure modules. Its jobs: drive the toolbar-icon open/close (issue #25), offer category
// switching from the icon's right-click menu, and seed the denylist.
//
// TOOLBAR ICON (issue #25 — owner behaviour):
//   - LEFT CLICK is the everyday gesture: pane CLOSED → open the side panel (to the current category
//     the panel reads from storage); pane OPEN → close it. It does NOT re-ask which category to show.
//   - FIRST RUN ONLY, when no category has ever been chosen ("it doesn't know what to open"), the left
//     click instead shows the category MENU popup (src/category-menu.html) so the user picks one; that
//     records the current category and opens the pane, and from then on the plain open/close applies.
//   - RIGHT CLICK (the action context menu) switches which category the pane shows — one item per
//     category; picking one records it and opens/switches the pane.
// MV3 can't do open-or-close from one static action (a popup suppresses onClicked, and there's no
// is-open/close API), so we track pane-open state via a Port the panel opens, and SWAP the action's
// popup: the popup is the category menu ONLY on first run (no category chosen, no pane open); otherwise
// it's cleared so a click fires `onClicked` (→ open the pane, or tell an open pane to close). Panel-open
// tracking is best-effort and window-agnostic (the common case is one window); it acts on the active tab.

import { DEFAULT_USER_DENYLIST } from './denylist.mjs';
import { getTopComment } from './api.mjs';
import { reconcileHoverRegistration } from './hover-registration.mjs';
import { beginNavigation, commitNavigation, provenanceKeyFor } from './redirect-provenance.mjs';
import { CATEGORIES } from '../vendor/categories.GENERATED.mjs';
import { createLogger } from './log.mjs';

const log = createLogger('sw');
export const DENYLIST_STORAGE_KEY = 'userDenylist';
const CATEGORY_MENU_POPUP = 'src/category-menu.html';
// The chrome.storage.local key the side panel and category menu read/write — its presence is how the
// icon knows a category has been chosen (so the first-run menu popup gives way to plain open/close).
const CURRENT_CATEGORY_STORAGE_KEY = 'currentCategory';
// Prefix for the action context-menu item ids (one per category), so onClicked can tell ours apart.
const CATEGORY_CONTEXT_MENU_PREFIX = 'tldr-category:';
const PANEL_PORT = 'panel';
const CLIENT_VERSION = chrome.runtime.getManifest().version;

// The live connections from open side panels. Non-empty ⇒ a pane is open somewhere.
const panelPorts = new Set();

// Has a category ever been chosen? Its presence in storage.local is what flips the icon from the
// first-run "pick one" popup to the everyday open/close click.
async function hasChosenCategory() {
  const stored = await chrome.storage.local.get(CURRENT_CATEGORY_STORAGE_KEY);
  const value = stored[CURRENT_CATEGORY_STORAGE_KEY];
  return typeof value === 'string' && value.length > 0;
}

// Reflect state onto the action's LEFT-click behaviour. The category-menu popup shows ONLY on first
// run — no category chosen yet AND no pane open ("when it doesn't know what to open"). Otherwise the
// popup is cleared so a click fires `onClicked`, which opens the pane (when closed) or closes it (when
// open). Switching category afterwards is the right-click menu, never this popup.
async function reflectPopup() {
  try {
    const firstRun = panelPorts.size === 0 && !(await hasChosenCategory());
    await chrome.action.setPopup({ popup: firstRun ? CATEGORY_MENU_POPUP : '' });
  } catch (err) {
    log.warn('action.setPopup failed', err);
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

// Fires whenever the popup is cleared — i.e. a category is already known (so the first-run menu is
// gone) or a pane is open. Pane OPEN → close it (there's no close API, so ask the pane(s) to close
// themselves — the panel calls window.close()). Pane CLOSED → open the side panel to the active tab;
// the panel reads the current category from storage, so the icon never re-asks which one to show.
chrome.action.onClicked.addListener(async (tab) => {
  if (panelPorts.size > 0) {
    for (const port of panelPorts) {
      try {
        port.postMessage({ type: 'close' });
      } catch {
        /* a stale port; its onDisconnect will clean it up */
      }
    }
    return;
  }
  await openPanelForTab(tab);
});

// Open the side panel for a tab (falling back to the active tab when a caller didn't supply one).
// Requires a user gesture — every caller runs inside the click/context-menu handler that has one.
async function openPanelForTab(tab) {
  try {
    const tabId = tab?.id ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
    if (tabId != null) await chrome.sidePanel.open({ tabId });
  } catch (err) {
    log.warn('sidePanel.open failed', err);
  }
}

// RIGHT-CLICK CATEGORY MENU (issue #25): switching which category the pane shows lives on the toolbar
// icon's context menu — the left click just opens/closes the pane. One item per category, built from
// the shared list so growing the taxonomy needs no change here; picking one records it as the current
// category (the key the panel reads and watches) and opens/switches the pane to it (a closed pane opens
// on it, an already-open pane switches live). Recreated (removeAll first) on install/startup so it
// self-heals rather than duplicating.
async function setupCategoryContextMenu() {
  try {
    await chrome.contextMenus.removeAll();
    for (const { id, label } of CATEGORIES) {
      chrome.contextMenus.create({
        id: CATEGORY_CONTEXT_MENU_PREFIX + id,
        title: label,
        contexts: ['action'],
      });
    }
  } catch (err) {
    log.warn('contextMenus setup failed', err);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItemId = String(info.menuItemId);
  if (!menuItemId.startsWith(CATEGORY_CONTEXT_MENU_PREFIX)) return; // not one of ours
  const category = menuItemId.slice(CATEGORY_CONTEXT_MENU_PREFIX.length);
  await chrome.storage.local.set({ [CURRENT_CATEGORY_STORAGE_KEY]: category });
  await openPanelForTab(tab);
});

// The first-run menu popup must give way to plain open/close the instant a category is first chosen —
// whether from the popup itself or the right-click menu — so reconcile the action on any change to the
// current-category key.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[CURRENT_CATEGORY_STORAGE_KEY]) reflectPopup();
});

async function seedDenylist() {
  const stored = await chrome.storage.sync.get(DENYLIST_STORAGE_KEY);
  if (!Array.isArray(stored[DENYLIST_STORAGE_KEY])) {
    await chrome.storage.sync.set({ [DENYLIST_STORAGE_KEY]: DEFAULT_USER_DENYLIST });
  }
}

// LINK-HOVER PREVIEW (issue #26): the content script (src/link-hover.mjs) runs in an arbitrary
// third-party page's origin, so it can't reach the API directly under a predictable CORS/CSP story —
// it messages the SW (a genuine extension context, already covered by the server's `*` CORS the same
// way sidepanel.mjs's fetches are) to do the actual read on its behalf.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'link-hover:getTopComment') return; // not ours — let another listener handle it
  getTopComment(message.pageUrl, message.category, { clientVersion: CLIENT_VERSION })
    .then((result) => sendResponse(result))
    .catch((err) => {
      // The content script fails silent on the far side (no popup), so this is the ONLY place the
      // reason a hover produced nothing (a network error, a 4xx/5xx) is visible — log it here.
      log.warn('link-hover top-comment fetch failed', {
        pageUrl: message.pageUrl,
        category: message.category ?? null,
        reason: err?.message ?? String(err),
      });
      sendResponse({ error: String(err?.message ?? err) });
    });
  return true; // keep the message channel open for the async sendResponse above
});

// REDIRECT PROVENANCE (issue #58): record, per tab, the URL a redirect chain started at, so the side
// panel can offer the cleaner pre-redirect URL's notes when the landing page has none. The record
// lives in chrome.storage.session — it survives this worker's recycles (the panel may open long after
// the navigation) and dies with the browser session. Listeners are registered at the top level so a
// navigation wakes a recycled worker.

// Per-tab promise chains serializing the read-modify-write on a tab's record, so an onBeforeNavigate/
// onCommitted pair (which arrive back-to-back) can't interleave. In-memory only: a worker recycle
// drops an empty map, not pending work.
const provenanceQueues = new Map();

function updateTabProvenance(tabId, mutate) {
  const next = (provenanceQueues.get(tabId) ?? Promise.resolve())
    .then(async () => {
      const key = provenanceKeyFor(tabId);
      const stored = await chrome.storage.session.get(key);
      const nextState = mutate(stored[key] ?? null);
      if (nextState == null) await chrome.storage.session.remove(key);
      else await chrome.storage.session.set({ [key]: nextState });
    })
    .catch((err) => log.warn('redirect-provenance update failed', { tabId, reason: err?.message ?? String(err) }))
    .finally(() => {
      if (provenanceQueues.get(tabId) === next) provenanceQueues.delete(tabId);
    });
  provenanceQueues.set(tabId, next);
  return next;
}

// frameId 0 is the top-level frame — iframe navigations say nothing about the page the tab is on.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  updateTabProvenance(details.tabId, (state) => beginNavigation(state, details.url));
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  updateTabProvenance(details.tabId, (state) =>
    commitNavigation(state, { url: details.url, qualifiers: details.transitionQualifiers ?? [] }),
  );
});

chrome.tabs.onRemoved.addListener((tabId) => {
  updateTabProvenance(tabId, () => null);
});

chrome.runtime.onInstalled.addListener(async () => {
  await reflectPopup(); // first run (no category, no pane): the icon opens the category menu
  await setupCategoryContextMenu(); // right-click → switch category
  await seedDenylist();
  await reconcileHoverRegistration(); // self-heal the hover-preview registration vs. its permission
});

// Re-assert the popup + context menu on startup in case they were ever lost.
chrome.runtime.onStartup.addListener(async () => {
  await reflectPopup();
  await setupCategoryContextMenu();
  await reconcileHoverRegistration();
});
