// Redirect provenance (issue #58): how did this tab ARRIVE at the page it's showing? Notes are keyed
// by the tab's final URL, so when a clean shareable URL redirects to a messier same-site one (a locale
// path, session/variant params the tracker-stripper doesn't know), the landing page's thread is
// fragmented away from the address people actually share. The service worker feeds webNavigation
// events through the reducer below to keep a per-tab record of the pre-redirect URL; the side panel
// asks `cleanerSourceOffer` whether that record earns the "this might not be the page's main address"
// offer. Pure logic — no chrome.* — so it's unit tested (extension-test/redirect-provenance.test.mjs).

import { normalizePageUrl } from '../vendor/normalizeUrl.GENERATED.mjs';
import { evaluatePage, hostMatches } from './denylist.mjs';

// The chrome.storage.session key the service worker writes a tab's record under and the side panel
// reads it back from — defined once here so the two sides can't drift.
export function provenanceKeyFor(tabId) {
  return `redirectProvenance:${tabId}`;
}

// Do two URLs name the same page (same pageId)? Falls back to raw string equality for a URL the
// normalizer rejects, so the reducer stays total over whatever webNavigation hands it.
function samePage(a, b) {
  if (a == null || b == null) return false;
  try {
    return normalizePageUrl(a) === normalizePageUrl(b);
  } catch {
    return a === b;
  }
}

// --- the per-tab navigation reducer ------------------------------------------------------------
//
// State: { pendingUrl, lastCommittedUrl, from }
//   pendingUrl       the URL the in-flight navigation STARTED at (onBeforeNavigate)
//   lastCommittedUrl the URL the tab actually rests at (onCommitted)
//   from             where the journey to lastCommittedUrl began, when that differs — i.e. the
//                    pre-redirect URL; null when the tab arrived directly.

export function beginNavigation(state, url) {
  return { ...(state ?? {}), pendingUrl: url };
}

export function commitNavigation(state, { url, qualifiers = [] }) {
  const prev = state ?? {};
  const started = prev.pendingUrl ?? url;
  let from;
  if (qualifiers.includes('client_redirect') && prev.lastCommittedUrl != null) {
    // The PAGE sent us here (JS/meta refresh): the journey began wherever the redirecting page's
    // own journey began, chaining multi-hop redirects back to the URL the user actually opened.
    from = prev.from ?? prev.lastCommittedUrl;
  } else if (!samePage(started, url)) {
    // Server redirect(s): the whole chain collapses into one navigation, so the pre-redirect URL is
    // simply where this navigation started.
    from = started;
  } else if (samePage(prev.lastCommittedUrl, url)) {
    // A reload (or an in-page recommit) of the same page keeps the arrival story — the hint should
    // survive an F5, not vanish because the reload itself didn't redirect.
    from = prev.from ?? null;
  } else {
    from = null; // a plain direct navigation
  }
  if (from != null && samePage(from, url)) from = null; // a redirect that stayed on the same page id is no redirect
  return { pendingUrl: null, lastCommittedUrl: url, from };
}

// --- the offer rule -----------------------------------------------------------------------------

/**
 * Decide whether a redirect earns the "show notes for the cleaner URL" offer (issue #58, the
 * owner-chosen gate): the source must be commentable, SAME-SITE as the target (host-suffix relation,
 * either direction — cross-site shorteners never prompt), a DIFFERENT page id (a tracking-only
 * diff normalizes away), and STRICTLY CLEANER — its normalized URL is shorter, i.e. the redirect
 * added path/params.
 * @returns {{pageId: string}|null} the cleaner page id to offer, or null when the offer isn't earned
 */
export function cleanerSourceOffer({ fromUrl, toUrl, userDenylist }) {
  if (!fromUrl || !toUrl) return null;
  let fromId;
  let toId;
  try {
    fromId = normalizePageUrl(fromUrl);
    toId = normalizePageUrl(toUrl);
  } catch {
    return null;
  }
  if (fromId === toId) return null;
  if (!evaluatePage(fromUrl, userDenylist).commentable) return null;
  const fromHost = new URL(fromId).hostname;
  const toHost = new URL(toId).hostname;
  if (!hostMatches(fromHost, toHost) && !hostMatches(toHost, fromHost)) return null;
  if (fromId.length >= toId.length) return null;
  return { pageId: fromId };
}
