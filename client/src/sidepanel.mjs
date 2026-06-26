// Side-panel UI. Fetches/renders comments for the ACTIVE TAB's page and posts new ones optimistically.
// Fetching only happens while this panel is open (§4.1, the dominant load lever) — when the panel is
// closed this page isn't running, so it generates zero reads.

import { normalizePageUrl } from '../vendor/normalizeUrl.GENERATED.mjs';
import { evaluatePage, DEFAULT_USER_DENYLIST } from './denylist.mjs';
import { getComments, postComment } from './api.mjs';
import { getIdToken } from './auth.mjs';
import { makeOptimisticComment, mergeComments, reconcileSuccess, markFailed } from './optimistic.mjs';

const DENYLIST_STORAGE_KEY = 'userDenylist';
const REFRESH_DEBOUNCE_MS = 300;

const els = {
  page: document.getElementById('page'),
  status: document.getElementById('status'),
  comments: document.getElementById('comments'),
  composer: document.getElementById('composer'),
  body: document.getElementById('body'),
  post: document.getElementById('post'),
  error: document.getElementById('composer-error'),
};

const state = {
  pageId: null, // normalized URL currently shown; also the dedupe key for refreshes
  serverComments: [],
  localComments: [], // optimistic + just-confirmed, not yet guaranteed in the CDN-cached read
  userDenylist: DEFAULT_USER_DENYLIST,
};

// --- helpers ----------------------------------------------------------------

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function setStatus(message) {
  state.serverComments = [];
  state.localComments = [];
  render();
  els.status.textContent = message;
  els.status.hidden = !message;
  els.composer.hidden = true;
}

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.url ?? '';
}

function timeAgo(createdAt) {
  if (!createdAt) return '';
  const seconds = Math.round((Date.now() - createdAt) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(createdAt).toLocaleDateString();
}

function render() {
  const comments = mergeComments(state.serverComments, state.localComments);
  els.comments.replaceChildren();
  for (const c of comments) {
    const li = document.createElement('li');
    li.className = 'comment' + (c.pending ? ' pending' : '') + (c.failed ? ' failed' : '');

    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = c.body; // textContent, never innerHTML — comment bodies are untrusted

    const meta = document.createElement('div');
    meta.className = 'comment-meta';
    const who = c.authorName || 'Someone';
    meta.textContent = c.failed
      ? `${who} · failed to post`
      : c.pending
        ? `${who} · posting…`
        : `${who} · ${timeAgo(c.createdAt)}`;

    li.append(body, meta);
    els.comments.append(li);
  }
  if (comments.length === 0 && !els.composer.hidden) {
    els.status.textContent = 'No notes yet — be the first.';
    els.status.hidden = false;
  } else if (!els.composer.hidden) {
    els.status.hidden = true;
  }
}

// --- refresh (read path) ----------------------------------------------------

async function refresh() {
  const rawUrl = await getActiveTabUrl();
  const verdict = evaluatePage(rawUrl, state.userDenylist);
  if (!verdict.commentable) {
    state.pageId = null;
    els.page.textContent = '';
    setStatus('TLDR is off for this page.');
    return;
  }

  let pageId;
  try {
    pageId = normalizePageUrl(rawUrl);
  } catch {
    state.pageId = null;
    setStatus('TLDR is off for this page.');
    return;
  }

  state.pageId = pageId;
  els.page.textContent = pageId;
  els.page.title = pageId;
  els.composer.hidden = false;
  els.status.hidden = true;

  try {
    const { comments } = await getComments(pageId);
    // Ignore a response that arrived after the user navigated away.
    if (state.pageId !== pageId) return;
    state.serverComments = comments ?? [];
    // Drop local entries the server now knows about.
    const serverIds = new Set(state.serverComments.map((c) => c.commentId));
    state.localComments = state.localComments.filter((c) => !serverIds.has(c.commentId));
    render();
  } catch (err) {
    console.warn('read failed', err);
    if (state.pageId === pageId && state.serverComments.length === 0) {
      els.status.textContent = "Couldn't load notes.";
      els.status.hidden = false;
    }
  }
}

const debouncedRefresh = debounce(refresh, REFRESH_DEBOUNCE_MS);

// --- post (write path) ------------------------------------------------------

async function onSubmit(event) {
  event.preventDefault();
  els.error.textContent = '';
  const body = els.body.value.trim();
  if (!body) return;
  if (!state.pageId) return;

  const pageId = state.pageId;
  const tempId = `temp-${crypto.randomUUID()}`;
  state.localComments = [
    ...state.localComments,
    makeOptimisticComment({ tempId, body, authorName: 'You', authorId: 'me', createdAt: Date.now() }),
  ];
  els.body.value = '';
  els.post.disabled = true;
  render();

  try {
    const { comment } = await postComment(pageId, body, getIdToken);
    state.localComments = reconcileSuccess(state.localComments, tempId, comment);
  } catch (err) {
    console.warn('post failed', err);
    state.localComments = markFailed(state.localComments, tempId);
    els.error.textContent = 'Could not post — try again.';
  } finally {
    els.post.disabled = false;
    render();
  }
}

// --- wiring -----------------------------------------------------------------

async function init() {
  const stored = await chrome.storage.sync.get(DENYLIST_STORAGE_KEY);
  if (Array.isArray(stored[DENYLIST_STORAGE_KEY])) state.userDenylist = stored[DENYLIST_STORAGE_KEY];

  els.composer.addEventListener('submit', onSubmit);

  // Refetch when the active page changes — but only the active-tab URL matters.
  chrome.tabs.onActivated.addListener(debouncedRefresh);
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) debouncedRefresh();
  });
  // SPA navigations (history.pushState) don't fire onUpdated.
  if (chrome.webNavigation?.onHistoryStateUpdated) {
    chrome.webNavigation.onHistoryStateUpdated.addListener(debouncedRefresh);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[DENYLIST_STORAGE_KEY]) {
      state.userDenylist = changes[DENYLIST_STORAGE_KEY].newValue ?? DEFAULT_USER_DENYLIST;
      debouncedRefresh();
    }
  });

  await refresh();
}

init();
