// Options page: edit the Layer-2 user denylist (chrome.storage.sync). The Layer-1 code denylist
// (the Web Store) is not editable here. Also hosts the link-hover preview opt-in toggle (issue #26).

import { DEFAULT_USER_DENYLIST } from './denylist.mjs';
import {
  registerHoverContentScript,
  unregisterHoverContentScript,
  HOVER_ORIGINS,
  HOVER_ENABLED_KEY,
} from './hover-registration.mjs';

const DENYLIST_STORAGE_KEY = 'userDenylist';

const textarea = document.getElementById('denylist');
const form = document.getElementById('form');
const saved = document.getElementById('saved');
const hoverToggle = document.getElementById('hover-preview-toggle');

function parse(text) {
  return text
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);
}

async function load() {
  const stored = await chrome.storage.sync.get(DENYLIST_STORAGE_KEY);
  const list = Array.isArray(stored[DENYLIST_STORAGE_KEY]) ? stored[DENYLIST_STORAGE_KEY] : DEFAULT_USER_DENYLIST;
  textarea.value = list.join('\n');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const list = [...new Set(parse(textarea.value))];
  await chrome.storage.sync.set({ [DENYLIST_STORAGE_KEY]: list });
  textarea.value = list.join('\n');
  saved.textContent = 'Saved.';
  setTimeout(() => (saved.textContent = ''), 1500);
});

// --- link-hover preview opt-in toggle (issue #26) ----------------------------
// Off by default (client/manifest.json requests it only as an OPTIONAL host permission — issue #30
// kept the install-time permission ask at zero). Checking this box is the one place that host access
// is ever requested, and it must happen HERE, synchronously inside this click handler: Chrome only
// honors chrome.permissions.request() during a live user gesture, so it can't be deferred to the
// service worker via a message. Unchecking revokes the permission again (not just the registration),
// so the extension's footprint shrinks back to zero the moment the user opts back out.

async function loadHoverToggle() {
  const stored = await chrome.storage.sync.get(HOVER_ENABLED_KEY);
  hoverToggle.checked = stored[HOVER_ENABLED_KEY] === true;
}

hoverToggle.addEventListener('change', async () => {
  if (hoverToggle.checked) {
    const granted = await chrome.permissions.request({ origins: HOVER_ORIGINS });
    if (!granted) {
      hoverToggle.checked = false; // the user declined the browser's own permission prompt
      return;
    }
    await registerHoverContentScript();
    await chrome.storage.sync.set({ [HOVER_ENABLED_KEY]: true });
  } else {
    await unregisterHoverContentScript();
    await chrome.storage.sync.set({ [HOVER_ENABLED_KEY]: false });
    await chrome.permissions.remove({ origins: HOVER_ORIGINS });
  }
});

load();
loadHoverToggle();
