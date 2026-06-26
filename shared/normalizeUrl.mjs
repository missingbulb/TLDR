// SINGLE SOURCE OF TRUTH for URL normalization, shared by the server (Lambda) and the
// client (Chrome extension). Both sides MUST normalize identically: the normalized URL is
// the DynamoDB partition key (`pageId`) and the CloudFront cache key. If the two sides ever
// disagree, the client writes a comment under pageId A while a read looks under pageId B and
// the comment silently vanishes.
//
// This file is the canonical copy. It is vendored verbatim into the places that cannot
// import across the repo at runtime:
//   - server/src/vendor/normalizeUrl.GENERATED.mjs  (so SAM/esbuild bundling is path-robust)
//   - client/vendor/normalizeUrl.GENERATED.mjs       (so the extension ships a self-contained copy)
// Run `npm run sync-shared` after editing this file; CI fails on byte drift (test/shared-drift.test.mjs).
//
// Implemented with the WHATWG `URL` API, which exists identically in Node 18+ and every browser,
// so the same source runs on both sides.
//
// Normalization rules (v1):
//   - lowercase the scheme and host (URL.origin already does this and drops default ports :80/:443)
//   - keep the path case-sensitive (paths ARE case-sensitive per RFC 3986)
//   - drop the #fragment
//   - strip the query string entirely (so ?utm_* and other trackers don't fragment a page)
//   - remove trailing slash(es)
//   - only http/https are valid pages to comment on; everything else throws
//
// KNOWN v1 LIMITATION (flagged for the owner): stripping the query string collapses pages whose
// identity lives in the query (e.g. youtube.com/watch?v=A and ?v=B become the SAME pageId), and
// dropping the fragment collapses hash-routed SPAs. See docs/architecture.md §4.3 / §11.

export class InvalidPageUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidPageUrlError';
  }
}

/**
 * Normalize a page URL into the canonical `pageId` used as the DynamoDB partition key and
 * CloudFront cache key.
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
  // url.origin is already lowercased (scheme + host) with the default port removed and any
  // userinfo dropped. The path stays case-sensitive; we strip trailing slashes and drop ?query / #fragment.
  const path = url.pathname.replace(/\/+$/, '');
  return url.origin.toLowerCase() + path;
}
