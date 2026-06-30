// Side-panel UI. Fetches/renders comments for the ACTIVE TAB's page and posts new ones optimistically.
// Fetching only happens while this panel is open (§4.1, the dominant load lever) — when the panel is
// closed this page isn't running, so it generates zero reads. Fetched pages are cached in memory for the
// panel's lifetime (§4.4), so switching back to an already-seen tab renders from cache with no refetch;
// only a real reload/navigation refetches.

import { normalizePageUrl } from '../vendor/normalizeUrl.GENERATED.mjs';
import { evaluatePage, DEFAULT_USER_DENYLIST } from './denylist.mjs';
import { getComments, postComment } from './api.mjs';
import { getIdToken } from './auth.mjs';
import { makeOptimisticComment, mergeComments, reconcileSuccess, markFailed } from './optimistic.mjs';

const DENYLIST_STORAGE_KEY = 'userDenylist';
const REFRESH_DEBOUNCE_MS = 300;
// The extension's own version, read once and attached to every API request as X-Client-Version so the
// server can log which client versions are still calling (dev/docs/architecture.md §9.1). Read here
// (not inside api.mjs) so the api module stays Chrome-free and unit-testable.
const CLIENT_VERSION = chrome.runtime.getManifest().version;
// Cap the per-page cache so a long browsing session can't grow it unbounded. Comments are sparse
// (this isn't a live thread) so this is generous; eviction is oldest-first (Map insertion order).
const MAX_CACHE_PAGES = 100;

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
  serverComments: [], // live mirror of the active page's bucket (what render() draws)
  localComments: [], // optimistic + just-confirmed, not yet guaranteed in the CDN-cached read
  userDenylist: DEFAULT_USER_DENYLIST,
  // Per-page comment cache, kept for the panel's lifetime (≈ "until the tab is closed"). Comments
  // arrive sparsely (not a live thread), so a plain tab switch back to a cached page renders from
  // here with no network fetch; we only refetch on a real navigation/reload. pageId -> bucket
  // ({ serverComments, localComments }).
  cache: new Map(),
};

// --- helpers ----------------------------------------------------------------

// Get (creating if absent) the cached bucket for a page. Creating a new bucket may evict the
// oldest to honor MAX_CACHE_PAGES.
function bucketFor(pageId) {
  let bucket = state.cache.get(pageId);
  if (!bucket) {
    if (state.cache.size >= MAX_CACHE_PAGES) {
      state.cache.delete(state.cache.keys().next().value);
    }
    bucket = { serverComments: [], localComments: [] };
    state.cache.set(pageId, bucket);
  }
  return bucket;
}

// Mirror a page's bucket into the live render state — but only while it's still the active page,
// so a response/post that lands after the user switched tabs doesn't clobber the current view.
function syncView(pageId) {
  if (state.pageId !== pageId) return;
  const bucket = bucketFor(pageId);
  state.serverComments = bucket.serverComments;
  state.localComments = bucket.localComments;
}

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

// `useCache: true` (a plain tab switch) renders an already-fetched page from cache with no network
// hit. `useCache: false` (initial load, reload, navigation) always refetches — rendering any cached
// copy first so there's no loading flash — and updates the cache.
async function refresh({ useCache = false } = {}) {
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

  const cached = state.cache.has(pageId);
  state.pageId = pageId;
  els.page.textContent = pageId;
  els.page.title = pageId;
  els.composer.hidden = false;
  els.status.hidden = true;

  // Show whatever we already have for this page (cached comments, or an empty bucket).
  syncView(pageId);
  render();

  // A tab switch back to an already-fetched page: cache is enough, no network.
  if (cached && useCache) return;

  try {
    const { comments } = await getComments(pageId, { clientVersion: CLIENT_VERSION });
    // Ignore a response that arrived after the user navigated away.
    if (state.pageId !== pageId) return;
    const bucket = bucketFor(pageId);
    bucket.serverComments = comments ?? [];
    // Drop local entries the server now knows about.
    const serverIds = new Set(bucket.serverComments.map((c) => c.commentId));
    bucket.localComments = bucket.localComments.filter((c) => !serverIds.has(c.commentId));
    syncView(pageId);
    render();
  } catch (err) {
    console.warn('read failed', err);
    if (state.pageId === pageId && state.serverComments.length === 0) {
      els.status.textContent = "Couldn't load notes.";
      els.status.hidden = false;
    }
  }
}

// Tab switches reuse the cache; reloads/navigations force a refetch.
const debouncedRefreshCached = debounce(() => refresh({ useCache: true }), REFRESH_DEBOUNCE_MS);
const debouncedRefreshForce = debounce(() => refresh({ useCache: false }), REFRESH_DEBOUNCE_MS);

// --- post (write path) ------------------------------------------------------

async function onSubmit(event) {
  event.preventDefault();
  els.error.textContent = '';
  const body = els.body.value.trim();
  if (!body) return;
  if (!state.pageId) return;

  const pageId = state.pageId;
  // Mutate the page's bucket (not just the live view) so the optimistic comment survives a tab
  // switch away and back, and so it never leaks onto another tab's view.
  const bucket = bucketFor(pageId);
  const tempId = `temp-${crypto.randomUUID()}`;
  bucket.localComments = [
    ...bucket.localComments,
    makeOptimisticComment({ tempId, body, authorName: 'You', authorId: 'me', createdAt: Date.now() }),
  ];
  syncView(pageId);
  els.body.value = '';
  els.post.disabled = true;
  render();

  try {
    const { comment } = await postComment(pageId, body, getIdToken, { clientVersion: CLIENT_VERSION });
    bucket.localComments = reconcileSuccess(bucket.localComments, tempId, comment);
  } catch (err) {
    console.warn('post failed', err);
    bucket.localComments = markFailed(bucket.localComments, tempId);
    els.error.textContent = 'Could not post — try again.';
  } finally {
    els.post.disabled = false;
    syncView(pageId);
    render();
  }
}

// --- wiring -----------------------------------------------------------------

async function init() {
  const stored = await chrome.storage.sync.get(DENYLIST_STORAGE_KEY);
  if (Array.isArray(stored[DENYLIST_STORAGE_KEY])) state.userDenylist = stored[DENYLIST_STORAGE_KEY];

  els.composer.addEventListener('submit', onSubmit);

  // A plain tab switch reuses the cache (no refetch); a reload/navigation refetches.
  chrome.tabs.onActivated.addListener(debouncedRefreshCached);
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) debouncedRefreshForce();
  });
  // SPA navigations (history.pushState) don't fire onUpdated.
  if (chrome.webNavigation?.onHistoryStateUpdated) {
    chrome.webNavigation.onHistoryStateUpdated.addListener(debouncedRefreshForce);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[DENYLIST_STORAGE_KEY]) {
      state.userDenylist = changes[DENYLIST_STORAGE_KEY].newValue ?? DEFAULT_USER_DENYLIST;
      debouncedRefreshForce();
    }
  });

  await refresh({ useCache: false });
}

init();
