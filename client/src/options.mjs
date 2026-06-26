// Options page: edit the Layer-2 user denylist (chrome.storage.sync). The Layer-1 code denylist
// (the Web Store) is not editable here.

import { DEFAULT_USER_DENYLIST } from './denylist.mjs';

const DENYLIST_STORAGE_KEY = 'userDenylist';

const textarea = document.getElementById('denylist');
const form = document.getElementById('form');
const saved = document.getElementById('saved');

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

load();
