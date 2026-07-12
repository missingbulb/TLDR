// The link-hover preview content script (issue #26). Registered DYNAMICALLY — see hover-registration.mjs
// — never statically in manifest.json, so it only ever runs on a page after the user has opted in via
// the options-page toggle and granted the optional host permission. It's loaded via a classic boot
// shim (link-hover-boot.mjs) that dynamic-imports THIS module — a content script can't be an ES module
// itself, so a static `import` here would throw "Cannot use import statement outside a module" if it
// were registered directly; the shim + manifest web_accessible_resources are what make these imports
// resolve. Once running, it behaves exactly
// like sidepanel.mjs: top-level state + a bottom-of-file init() call reading the ambient `document` /
// `chrome` globals (no dependency injection) — the same shape a test seeds by swapping those globals
// before a fresh dynamic import (dev/requirements/shared/render/link-hover-harness.mjs), consistent
// with how harness.mjs already drives the real sidepanel.mjs/options.mjs.
//
// Flow per hover: debounce -> gate (http(s) + not on the per-site denylist, via link-hover-gate.mjs's
// candidatePageId — the SAME evaluatePage gate the side panel applies to the active tab, fed the SAME
// synced user denylist) -> read the CURRENT category fresh from chrome.storage.local (content scripts
// already have chrome.storage access with no host permission needed) -> ask the service worker for
// that page+category's leading comment (chrome.runtime.sendMessage — the actual fetch runs in the SW, a
// genuine extension context already covered by the server's `*` CORS, never in the content script
// itself, which sits in an arbitrary, CSP-unpredictable page origin) -> mount the result (if any) in a
// shadow root, isolated from the host page's own styles. Per the owner-chosen empty-state behavior: no
// comment in the category => show nothing, ever.

import { DEFAULT_USER_DENYLIST } from './denylist.mjs';
import { candidatePageId } from './link-hover-gate.mjs';
import { DEFAULT_CATEGORY } from '../vendor/categories.GENERATED.mjs';
import { buildTooltipElement, positionTooltip } from './hover-tooltip.mjs';
import { createLogger } from './log.mjs';

const log = createLogger('link-hover');
const HOVER_DEBOUNCE_MS = 400;
// Mirrors sidepanel.mjs's CURRENT_CATEGORY_STORAGE_KEY (issue #25) and DENYLIST_STORAGE_KEY — both
// duplicated here as literals, like the rest of this codebase's storage keys, rather than introducing a
// shared-constants module for two strings.
const CURRENT_CATEGORY_STORAGE_KEY = 'currentCategory';
const DENYLIST_STORAGE_KEY = 'userDenylist';

let debounceTimer = null;
let hoveredAnchor = null; // the <a> the pending/shown tooltip is FOR, so a late response can be discarded
let shadowHost = null;

function teardownTooltip() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
  }
}

async function loadUserDenylist() {
  const stored = await chrome.storage.sync.get(DENYLIST_STORAGE_KEY);
  return Array.isArray(stored[DENYLIST_STORAGE_KEY]) ? stored[DENYLIST_STORAGE_KEY] : DEFAULT_USER_DENYLIST;
}

async function currentCategory() {
  const stored = await chrome.storage.local.get(CURRENT_CATEGORY_STORAGE_KEY);
  return stored[CURRENT_CATEGORY_STORAGE_KEY] ?? DEFAULT_CATEGORY;
}

async function showTooltipFor(anchor) {
  const userDenylist = await loadUserDenylist();
  const pageId = candidatePageId(anchor.href, userDenylist);
  if (!pageId) return; // not a candidate link (non-http(s), or denylisted) — no lookup at all
  if (hoveredAnchor !== anchor) return; // the pointer moved on while the denylist was loading

  const category = await currentCategory();
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'link-hover:getTopComment', pageUrl: pageId, category });
  } catch (err) {
    // The SW is unreachable (e.g. it was recycled mid-flight) — fail silent (no error popup), but log
    // it: a hover that shows nothing is otherwise indistinguishable from the genuine empty state.
    log.debug('SW unreachable for hover lookup', { pageId, reason: err?.message ?? String(err) });
    return;
  }
  // The SW puts a fetch failure on `response.error` (it fails silent on our side too) — surface it.
  if (response?.error) log.debug('hover lookup returned an error', { pageId, error: response.error });
  if (hoveredAnchor !== anchor) return; // the pointer moved on before the response landed
  const comment = response?.comment;
  if (!comment) return; // empty-state decision (issue #26): no leading comment => show nothing

  const { style, tooltip } = buildTooltipElement(comment, category, { document });
  shadowHost = document.createElement('div');
  const shadow = shadowHost.attachShadow({ mode: 'open' });
  shadow.append(style, tooltip);
  document.body.append(shadowHost);
  positionTooltip(tooltip, anchor.getBoundingClientRect());
}

function onMouseOver(event) {
  const anchor = event.target.closest?.('a[href]');
  if (!anchor || anchor === hoveredAnchor) return;
  teardownTooltip();
  hoveredAnchor = anchor;
  debounceTimer = setTimeout(() => showTooltipFor(anchor), HOVER_DEBOUNCE_MS);
}

function onMouseOut(event) {
  const anchor = event.target.closest?.('a[href]');
  if (!anchor || anchor !== hoveredAnchor) return;
  teardownTooltip();
  hoveredAnchor = null;
}

function init() {
  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);
  log.debug('content script active on', document.location?.href);
}

init();
