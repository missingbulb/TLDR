// Thin API client. The fetch implementation is injectable so the logic (URL building, the
// public-vs-authenticated split, the 401-refresh-retry) is unit tested without a network.
//
// Reads are PUBLIC and sent WITHOUT an Authorization header — keeping reads cache-friendly at
// CloudFront (the cache key excludes Authorization). Only writes carry the bearer token.
//
// Every request also carries X-Client-Version (the extension's manifest version, injected by the
// caller). It's the version-telemetry the server logs so we can tell when no old client is still
// calling and an old behavior is safe to retire (dev/docs/architecture.md §9.1). It rides in a
// REQUEST HEADER on purpose: it stays out of the body (additive — it never reshapes the wire
// contract) and out of the CloudFront cache key (which keys on pageUrl + Origin, not headers), so
// public reads stay cache-friendly. The server must allow it in CORS (template.yaml AllowHeaders),
// since a custom header makes the read a non-simple request that triggers a preflight.

import { API_BASE_URL } from '../config.mjs';

// The version header, or nothing when no version was supplied (e.g. an injection-free unit call) —
// spread into a headers object so an absent version simply adds no header.
function clientVersionHeader(clientVersion) {
  return clientVersion ? { 'x-client-version': clientVersion } : undefined;
}

export async function getComments(pageUrl, { fetchImpl = fetch, nextToken, clientVersion } = {}) {
  const params = new URLSearchParams({ pageUrl });
  if (nextToken) params.set('nextToken', nextToken);
  const res = await fetchImpl(`${API_BASE_URL}/comments?${params.toString()}`, {
    method: 'GET',
    headers: clientVersionHeader(clientVersion),
  });
  if (!res.ok) throw new Error(`read failed: ${res.status}`);
  return res.json();
}

export async function postComment(pageUrl, body, getIdToken, { fetchImpl = fetch, clientVersion } = {}) {
  const send = (token) =>
    fetchImpl(`${API_BASE_URL}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...clientVersionHeader(clientVersion),
      },
      body: JSON.stringify({ pageUrl, body }),
    });

  // First send uses a SILENT token only (no UI). This runs inside the Post user gesture, so the 401
  // retry is the one place we permit an interactive prompt — and only if the silent refresh fails.
  let res = await send(await getIdToken({ interactive: false }));
  if (res.status === 401) {
    // Token rejected (likely expired) — force-refresh once, allowing a visible prompt as a last resort.
    res = await send(await getIdToken({ forceRefresh: true, interactive: true }));
  }
  if (!res.ok) throw new Error(`post failed: ${res.status}`);
  return res.json();
}
