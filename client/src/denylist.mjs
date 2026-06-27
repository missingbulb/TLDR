// Two-layer "should we even bother with this page?" gate. Pure logic — no chrome.* — so it's unit
// tested. Keeping the side pane closed already produces zero reads (§4.1); this trims the rest.

export const ALLOWED_SCHEMES = ['http:', 'https:'];

// Layer 1 — non-removable code constant. Pages where commenting is impossible or nonsensical, and
// where Chrome physically blocks extension injection anyway (the Web Store). Browser-internal pages
// (chrome://, about:, edge://) are non-http(s) and so are already excluded by the scheme check.
export const CODE_BLOCKED_HOSTS = ['chrome.google.com', 'chromewebstore.google.com'];

// Layer 2 — the seed for the user-editable denylist (stored in chrome.storage.sync). The owner may
// add/remove entries in the options page. Search engines are seeded off by default: their result
// pages are personalized/ephemeral and (after tracker stripping) many queries still collapse, so a
// shared notes thread there makes little sense. A user can remove any of these.
export const DEFAULT_USER_DENYLIST = ['localhost', '127.0.0.1', 'google.com', 'bing.com', 'duckduckgo.com'];

// Host-suffix match: `example.com` matches `example.com` and `www.example.com`, but not `notexample.com`.
export function hostMatches(host, pattern) {
  if (!host || !pattern) return false;
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  return h === p || h.endsWith('.' + p);
}

export function hostInList(host, patterns) {
  return patterns.some((pattern) => hostMatches(host, pattern));
}

/**
 * Decide whether a page is commentable.
 * @returns {{commentable: boolean, reason?: string}} reason is one of
 *   'not-a-url' | 'scheme' | 'code-denylist' | 'user-denylist'
 */
export function evaluatePage(rawUrl, userDenylist = DEFAULT_USER_DENYLIST) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { commentable: false, reason: 'not-a-url' };
  }
  if (!ALLOWED_SCHEMES.includes(url.protocol)) return { commentable: false, reason: 'scheme' };
  if (hostInList(url.hostname, CODE_BLOCKED_HOSTS)) return { commentable: false, reason: 'code-denylist' };
  if (hostInList(url.hostname, userDenylist)) return { commentable: false, reason: 'user-denylist' };
  return { commentable: true };
}
