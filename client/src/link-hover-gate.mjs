// Pure link-hover gating rule (issue #26): decide whether a hovered <a>'s href is even a CANDIDATE for
// a lookup. No chrome.*, no DOM beyond a plain href string, so it's directly unit-tested and reused,
// unmodified, by the content script (link-hover.mjs). Composes two ALREADY-tested primitives —
// evaluatePage (the same http(s) + per-site-denylist gate the side panel applies to the active tab) and
// normalizePageUrl (the same normalization the server/side-panel both use) — deliberately adding no new
// rule of its own: the hover feature's "should we even look this URL up" answer is IDENTICAL to "is
// this page commentable", never a separate policy that could drift from it.

import { evaluatePage } from './denylist.mjs';
import { normalizePageUrl } from '../vendor/normalizeUrl.GENERATED.mjs';

// Resolve an absolute `href` to its normalized pageId, or null if it's not a lookup candidate — a
// non-http(s) scheme, an unparseable URL, or a host on `userDenylist` (the same per-site opt-out the
// side panel honors), per evaluatePage's own gates.
export function candidatePageId(href, userDenylist) {
  if (!evaluatePage(href, userDenylist).commentable) return null;
  try {
    return normalizePageUrl(href);
  } catch {
    return null;
  }
}
