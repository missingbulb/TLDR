// The toolbar-icon popup (issue #25): choose the CURRENT top-level category. Picking one records it
// (chrome.storage.local, the same key the side panel reads/watches) and opens the side panel to it —
// so a closed pane opens on the chosen category, and an already-open pane switches to it live (the
// panel watches the key). The category BUTTONS are built from the shared CATEGORIES list, so growing
// the taxonomy needs no change here.
//
// The service worker only shows this popup while the pane is CLOSED; while it's open the icon toggles
// the pane closed instead (service-worker.mjs swaps the action popup on the pane's open/close).

import { CATEGORIES } from '../vendor/categories.GENERATED.mjs';
import { createLogger } from './log.mjs';

const log = createLogger('menu');
const CURRENT_CATEGORY_STORAGE_KEY = 'currentCategory';
const menu = document.getElementById('menu');

async function choose(id) {
  await chrome.storage.local.set({ [CURRENT_CATEGORY_STORAGE_KEY]: id });
  // Open the side panel for the active tab. Requires a user gesture (this click) — Chrome 116+.
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    log.warn('sidePanel.open failed', { category: id, reason: err?.message ?? String(err) });
  }
  window.close(); // dismiss the popup
}

for (const { id, label } of CATEGORIES) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-item';
  btn.dataset.category = id;
  btn.textContent = label;
  btn.addEventListener('click', () => choose(id));
  li.append(btn);
  menu.append(li);
}
