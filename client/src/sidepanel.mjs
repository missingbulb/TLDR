// Side-panel UI. Fetches/renders comments for the ACTIVE TAB's page and posts new ones optimistically.
// Fetching only happens while this panel is open (§4.1, the dominant load lever) — when the panel is
// closed this page isn't running, so it generates zero reads. Fetched pages are cached in memory for the
// panel's lifetime (§4.4), so switching back to an already-seen tab renders from cache with no refetch;
// only a real reload/navigation refetches.

import { normalizePageUrl } from '../vendor/normalizeUrl.GENERATED.mjs';
import { evaluatePage, DEFAULT_USER_DENYLIST } from './denylist.mjs';
import { getComments, postComment, castVote, removeVote } from './api.mjs';
import { getIdToken } from './auth.mjs';
import { makeOptimisticComment, mergeComments, reconcileSuccess, markFailed, applyVoteToggle } from './optimistic.mjs';

const DENYLIST_STORAGE_KEY = 'userDenylist';
// The viewer's own votes, persisted to chrome.storage.local so `youVoted` survives a panel reopen.
// It can't ride the shared, CDN-cached public read (the cache key excludes Authorization), so the
// client owns it (issue #22). A flat array of commentIds (a Set on the wire would not serialize).
const MY_VOTES_STORAGE_KEY = 'myVotes';
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
  myVotes: new Set(), // commentIds the viewer has upvoted (the durable source of `youVoted`)
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

    // A saved comment gets a vote rail on its LEFT (the ▲ button above its count); a pending/failed
    // optimistic note has no server commentId to vote on yet, so it keeps the bare body+meta layout.
    if (c.pending || c.failed) {
      li.append(body, meta);
    } else {
      li.classList.add('voteable');
      const main = document.createElement('div');
      main.className = 'comment-main';
      main.append(body, meta);
      li.append(renderVoteRail(c), main);
    }
    els.comments.append(li);
  }
  if (comments.length === 0 && !els.composer.hidden) {
    els.status.textContent = 'No notes yet — be the first.';
    els.status.hidden = false;
  } else if (!els.composer.hidden) {
    els.status.hidden = true;
  }
}

// The per-comment vote rail (left of the comment): the ▲ button on top, the count below in a larger
// font (0 included — the control is never missing). Voted-by-me is shown by ACCENT colour on both the
// button and the count (vs muted when un-voted); the glyph stays filled because the bundled snapshot
// font has no outline triangle, and colour isn't the only signal — the button's `aria-pressed` and
// its accessible name (which includes the count) carry the state to assistive tech, so the visually
// larger count is aria-hidden to avoid a double read. Clicking casts/removes the vote (onVote).
function renderVoteRail(c) {
  const count = c.voteCount ?? 0;
  const rail = document.createElement('div');
  rail.className = 'vote-rail';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'vote' + (c.youVoted ? ' voted' : '');
  btn.setAttribute('aria-pressed', c.youVoted ? 'true' : 'false');
  btn.setAttribute('aria-label', `${c.youVoted ? 'Remove your upvote' : 'Upvote'} (${count})`);
  btn.title = c.youVoted ? 'Remove your upvote' : 'Upvote';
  btn.textContent = '▲'; // the button's accessible name is the aria-label, not this glyph

  const num = document.createElement('span');
  num.className = 'vote-count' + (c.youVoted ? ' voted' : '');
  num.setAttribute('aria-hidden', 'true'); // the count already rides the button's accessible name
  num.textContent = String(count);

  rail.append(btn, num);
  btn.addEventListener('click', () => onVote(c.commentId));
  return rail;
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
    // Overlay the viewer's own vote onto each server record (the public read can't carry it — see
    // MY_VOTES_STORAGE_KEY), so a reopened panel shows previously-cast votes as voted.
    bucket.serverComments = (comments ?? []).map((c) => ({ ...c, youVoted: state.myVotes.has(c.commentId) }));
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

// --- vote (write path) ------------------------------------------------------

// Toggle the viewer's upvote on a comment. Optimistic: flip the count/affordance and persist the vote
// immediately (so it survives a reopen), fire the authenticated write, and roll back on failure so a
// rejected vote leaves no phantom count (issue #22). Runs inside the click gesture, which is what
// licenses api.mjs's one interactive token retry.
async function onVote(commentId) {
  const pageId = state.pageId;
  if (!pageId) return;
  const bucket = bucketFor(pageId);
  const current = mergeComments(bucket.serverComments, bucket.localComments).find((c) => c.commentId === commentId);
  if (!current) return;
  const voted = !current.youVoted;

  applyVoteLocally(bucket, commentId, voted);
  syncView(pageId);
  render();

  try {
    await (voted ? castVote : removeVote)(pageId, commentId, getIdToken, { clientVersion: CLIENT_VERSION });
  } catch (err) {
    console.warn('vote failed', err);
    applyVoteLocally(bucket, commentId, !voted); // restore the prior state (count + affordance)
    syncView(pageId);
    render();
  }
}

// Apply (or revert) one vote to a page's bucket: flip the comment in both lists (it lives in exactly
// one; applyVoteToggle no-ops the other) and update + persist the durable own-vote set.
function applyVoteLocally(bucket, commentId, voted) {
  bucket.serverComments = applyVoteToggle(bucket.serverComments, commentId, voted);
  bucket.localComments = applyVoteToggle(bucket.localComments, commentId, voted);
  if (voted) state.myVotes.add(commentId);
  else state.myVotes.delete(commentId);
  persistMyVotes();
}

function persistMyVotes() {
  chrome.storage.local.set({ [MY_VOTES_STORAGE_KEY]: [...state.myVotes] });
}

// --- wiring -----------------------------------------------------------------

async function init() {
  const stored = await chrome.storage.sync.get(DENYLIST_STORAGE_KEY);
  if (Array.isArray(stored[DENYLIST_STORAGE_KEY])) state.userDenylist = stored[DENYLIST_STORAGE_KEY];

  // Load the viewer's own votes before the first refresh so its youVoted overlay is seeded.
  const storedVotes = await chrome.storage.local.get(MY_VOTES_STORAGE_KEY);
  if (Array.isArray(storedVotes[MY_VOTES_STORAGE_KEY])) state.myVotes = new Set(storedVotes[MY_VOTES_STORAGE_KEY]);

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
