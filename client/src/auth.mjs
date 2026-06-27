// Google ID-token auth for the extension.
//
// We need an ID TOKEN (a Google-signed RS256 JWT) so the API Gateway JWT authorizer can validate it.
// chrome.identity.getAuthToken() would return an OPAQUE ACCESS token the authorizer cannot validate,
// so we use chrome.identity.launchWebAuthFlow with response_type=id_token instead.
//
// This module splits into PURE helpers (tested in node) and the chrome.identity orchestration (which
// only touches chrome.* inside functions, so importing this module under node never references chrome).

import { GOOGLE_CLIENT_ID } from '../config.mjs';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_CACHE_KEY = 'tldr_id_token';
const EXPIRY_SKEW_SECONDS = 300; // refresh 5 min before the token actually expires

// --- pure helpers -----------------------------------------------------------

export function randomToken(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildAuthUrl({ clientId, redirectUri, nonce, state, prompt }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'id_token',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    nonce,
    state,
  });
  // Only the SILENT refresh sets prompt=none (Google returns a token with no UI when already
  // consented, else an error we fall back on). The interactive flow omits prompt so Google shows
  // login/consent only when actually needed — not on every refresh.
  if (prompt) params.set('prompt', prompt);
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

// launchWebAuthFlow returns the final redirect URL; the id_token is in its fragment.
export function parseRedirectFragment(redirectUrl) {
  const url = new URL(redirectUrl);
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(fragment);
  return {
    idToken: params.get('id_token'),
    state: params.get('state'),
    error: params.get('error'),
  };
}

export function decodeJwtPayload(idToken) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('malformed JWT');
  let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  base64 += '='.repeat((4 - (base64.length % 4)) % 4); // JWT segments are unpadded; atob can be strict
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function isExpired(payload, nowMs = Date.now(), skewSeconds = EXPIRY_SKEW_SECONDS) {
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp * 1000 <= nowMs + skewSeconds * 1000;
}

// --- chrome.identity orchestration (not unit-tested; exercised in a real browser) ---------------

async function loadValidCachedToken() {
  const stored = await chrome.storage.session.get(TOKEN_CACHE_KEY);
  const entry = stored[TOKEN_CACHE_KEY];
  if (!entry?.idToken) return null;
  try {
    if (isExpired(decodeJwtPayload(entry.idToken))) return null;
  } catch {
    return null;
  }
  return entry.idToken;
}

async function cacheToken(idToken) {
  await chrome.storage.session.set({ [TOKEN_CACHE_KEY]: { idToken } });
}

async function mintToken({ interactive }) {
  const redirectUri = chrome.identity.getRedirectURL();
  const nonce = randomToken();
  const state = randomToken();
  const authUrl = buildAuthUrl({
    clientId: GOOGLE_CLIENT_ID,
    redirectUri,
    nonce,
    state,
    // Silent refresh must use prompt=none (Google returns a token with no UI, or an error we fall
    // back on). The interactive attempt omits prompt so consent shows only when actually needed.
    prompt: interactive ? undefined : 'none',
  });

  const redirectUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive });
  if (!redirectUrl) throw new Error('auth cancelled');

  const { idToken, state: returnedState, error } = parseRedirectFragment(redirectUrl);
  if (error) throw new Error(`auth error: ${error}`);
  if (returnedState !== state) throw new Error('auth state mismatch');
  if (!idToken) throw new Error('no id_token returned');

  // Bind the response to our request: the nonce we sent must come back in the token.
  const payload = decodeJwtPayload(idToken);
  if (payload.nonce !== nonce) throw new Error('auth nonce mismatch');

  await cacheToken(idToken);
  return idToken;
}

/**
 * Get a valid Google ID token, refreshing as needed.
 * - Uses the cached token if still valid.
 * - Otherwise tries a SILENT refresh (interactive:false, no user gesture needed).
 * - Falls back to an INTERACTIVE flow only when allowed (call from a user-gesture handler).
 * @param {{forceRefresh?: boolean, interactive?: boolean}} opts
 */
export async function getIdToken({ forceRefresh = false, interactive = true } = {}) {
  if (!forceRefresh) {
    const cached = await loadValidCachedToken();
    if (cached) return cached;
  }
  try {
    return await mintToken({ interactive: false });
  } catch (err) {
    if (!interactive) throw err;
    return await mintToken({ interactive: true });
  }
}
