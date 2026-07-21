// Thin API client. The fetch implementation is injectable so the logic (URL building, the
// public-vs-authenticated split, the 401-refresh-retry) is unit tested without a network.
//
// Reads are PUBLIC and sent WITHOUT an Authorization header (every viewer sees the same list).
// Only writes carry the bearer token.
//
// Every request also carries X-Client-Version (the extension's manifest version, injected by the
// caller). It's the version-telemetry the server logs so we can tell when no old client is still
// calling and an old behavior is safe to retire (dev/docs/architecture.md §9.1). It rides in a
// REQUEST HEADER on purpose: it stays out of the body (additive — it never reshapes the wire
// contract). The server must allow it in CORS (template.yaml AllowHeaders),
// since a custom header makes the read a non-simple request that triggers a preflight.

import { API_BASE_URL } from '../config.mjs';
import { createLogger } from './log.mjs';

const log = createLogger('api');

// The version header, or nothing when no version was supplied (e.g. an injection-free unit call) —
// spread into a headers object so an absent version simply adds no header.
function clientVersionHeader(clientVersion) {
  return clientVersion ? { 'x-client-version': clientVersion } : undefined;
}

export async function getComments(pageUrl, { fetchImpl = fetch, nextToken, clientVersion } = {}) {
  const params = new URLSearchParams({ pageUrl });
  if (nextToken) params.set('nextToken', nextToken);
  log.debug('GET /comments', { pageUrl, nextToken: nextToken ?? null });
  const res = await fetchImpl(`${API_BASE_URL}/comments?${params.toString()}`, {
    method: 'GET',
    headers: clientVersionHeader(clientVersion),
  });
  if (!res.ok) {
    log.warn('GET /comments failed', { status: res.status, pageUrl });
    throw new Error(`read failed: ${res.status}`);
  }
  return res.json();
}

// The leading (top-voted) comment for a page in one category — the link-hover preview's lookup (issue
// #26). PUBLIC and unauthenticated, same as getComments; `category` is optional (the server defaults
// it), included only when supplied so an omitted category doesn't add a stray empty querystring value.
// Resolves to `{ comment }`, where `comment` is `null` when nothing has been posted in that category —
// that's the expected empty-state shape, not an error.
export async function getTopComment(pageUrl, category, { fetchImpl = fetch, clientVersion } = {}) {
  const params = new URLSearchParams({ pageUrl });
  if (category) params.set('category', category);
  log.debug('GET /comments/top', { pageUrl, category: category ?? null });
  const res = await fetchImpl(`${API_BASE_URL}/comments/top?${params.toString()}`, {
    method: 'GET',
    headers: clientVersionHeader(clientVersion),
  });
  if (!res.ok) {
    log.warn('GET /comments/top failed', { status: res.status, pageUrl, category: category ?? null });
    throw new Error(`top-comment read failed: ${res.status}`);
  }
  return res.json();
}

// Run an authenticated write: send first with a SILENT token (no UI); on a 401 (token likely expired)
// force-refresh once, permitting a visible Google prompt as a last resort. Both POST /comments and the
// vote routes are attributed writes with the identical token dance, so they share this. The caller runs
// inside a real user gesture (the Post click, the upvote click), which is what licenses the one
// interactive retry. `send(token)` performs the fetch and returns the Response.
async function authedWrite(send, getIdToken) {
  let res = await send(await getIdToken({ interactive: false }));
  if (res.status === 401) {
    res = await send(await getIdToken({ forceRefresh: true, interactive: true }));
  }
  return res;
}

// `category` (issue #25) rides in the POST BODY (an additive optional field — §9.1), not a header:
// unlike X-Client-Version it's real request data the server persists, and the server defaults it when
// absent, so an older client that omits it keeps working. Only the write carries it; reads are public
// and filter client-side, so the category never touches the GET cache key.
export async function postComment(pageUrl, body, getIdToken, { fetchImpl = fetch, clientVersion, category } = {}) {
  const send = (token) =>
    fetchImpl(`${API_BASE_URL}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...clientVersionHeader(clientVersion),
      },
      body: JSON.stringify(category ? { pageUrl, body, category } : { pageUrl, body }),
    });

  log.debug('POST /comments', { pageUrl, category: category ?? null });
  const res = await authedWrite(send, getIdToken);
  if (!res.ok) {
    log.warn('POST /comments failed', { status: res.status, pageUrl });
    throw new Error(`post failed: ${res.status}`);
  }
  return res.json();
}

// Cast (POST) or toggle off (DELETE) the signed-in user's single vote on a comment. Authenticated like
// a post (bearer token, 401-refresh-retry). The body carries `pageUrl` because the server needs the
// page partition to find the comment; `commentId` rides in the path. The server is idempotent (a
// repeat cast / a missing-vote toggle both succeed), so the client never has to reconcile the count
// from the response — it tracks its own vote optimistically (issue #22).
function voteRequest(method, pageUrl, commentId, getIdToken, { fetchImpl = fetch, clientVersion } = {}) {
  const send = (token) =>
    fetchImpl(`${API_BASE_URL}/comments/${encodeURIComponent(commentId)}/vote`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...clientVersionHeader(clientVersion),
      },
      body: JSON.stringify({ pageUrl }),
    });

  log.debug(`${method} /comments/{commentId}/vote`, { commentId, pageUrl });
  return authedWrite(send, getIdToken).then((res) => {
    if (!res.ok) {
      log.warn(`${method} vote failed`, { status: res.status, commentId, pageUrl });
      throw new Error(`vote failed: ${res.status}`);
    }
    return res.json();
  });
}

export function castVote(pageUrl, commentId, getIdToken, opts = {}) {
  return voteRequest('POST', pageUrl, commentId, getIdToken, opts);
}

export function removeVote(pageUrl, commentId, getIdToken, opts = {}) {
  return voteRequest('DELETE', pageUrl, commentId, getIdToken, opts);
}
