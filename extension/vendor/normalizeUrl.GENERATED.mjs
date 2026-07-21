// SINGLE SOURCE OF TRUTH for URL normalization, shared by the server (Lambda) and the
// client (Chrome extension). Both sides MUST normalize identically: the normalized URL is
// the DynamoDB partition key (`pageId`). If the two sides ever
// disagree, the client writes a comment under pageId A while a read looks under pageId B and
// the comment silently vanishes.
//
// This file is the canonical copy. It is vendored verbatim into the places that cannot
// import across the repo at runtime:
//   - server/src/vendor/normalizeUrl.GENERATED.mjs  (so SAM/esbuild bundling is path-robust)
//   - extension/vendor/normalizeUrl.GENERATED.mjs       (so the extension ships a self-contained copy)
// Run `npm run sync-shared` after editing this file; CI fails on byte drift (test/shared-drift.test.mjs).
//
// Implemented with the WHATWG `URL` API, which exists identically in Node 18+ and every browser,
// so the same source runs on both sides.
//
// Normalization rules:
//   - lowercase the scheme and host (URL.origin already does this and drops default ports :80/:443)
//   - keep the path case-sensitive (paths ARE case-sensitive per RFC 3986)
//   - drop the #fragment
//   - drop only KNOWN TRACKING query params (utm_*, fbclid, gclid, …); KEEP the rest, sorted by key
//     for a stable cache key. So youtube.com/watch?v=A and ?v=B stay distinct pages, while ?utm_*
//     noise no longer fragments a page. (If no meaningful params remain, the ? is dropped entirely.)
//   - remove trailing slash(es)
//   - only http/https are valid pages to comment on; everything else throws
//
// NOTE: dropping the fragment still collapses hash-routed SPAs (e.g. example.com/#/a vs /#/b) — a
// known limitation. See docs/architecture.md §4.3.

export class InvalidPageUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidPageUrlError';
  }
}

// Non-utm trackers to drop. The utm_ family is handled structurally by a prefix test below; this is
// the explicit set of common non-utm trackers. Extend as needed.
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid', 'yclid',
  'mc_cid', 'mc_eid', 'igshid', 'mkt_tok', '_hsenc', '_hsmi', 'vero_id',
  'oly_anon_id', 'oly_enc_id', 'twclid', 'ttclid', 's_kwcid',
]);

function isTrackingParam(key) {
  const k = key.toLowerCase();
  return k.startsWith('utm_') || TRACKING_PARAMS.has(k);
}

/**
 * Normalize a page URL into the canonical `pageId` used as the DynamoDB partition key.
 * @param {string} input a full URL
 * @returns {string} e.g. "https://example.com/articles/42"
 * @throws {InvalidPageUrlError} if the input is not a valid http(s) URL
 */
export function normalizePageUrl(input) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    throw new InvalidPageUrlError(`not a valid URL: ${input}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidPageUrlError(`unsupported scheme (only http/https): ${url.protocol}`);
  }
  // url.origin is already lowercased (scheme + host) with the default port removed and any userinfo
  // dropped. The path stays case-sensitive; we strip trailing slashes and drop the #fragment.
  const path = url.pathname.replace(/\/+$/, '');

  // Keep non-tracking query params, sorted by key so ?a=1&b=2 and ?b=2&a=1 yield the same pageId.
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!isTrackingParam(key)) kept.append(key, value);
  }
  kept.sort();
  const query = kept.toString();

  return url.origin.toLowerCase() + path + (query ? `?${query}` : '');
}
