// Thin API client. The fetch implementation is injectable so the logic (URL building, the
// public-vs-authenticated split, the 401-refresh-retry) is unit tested without a network.
//
// Reads are PUBLIC and sent WITHOUT an Authorization header — keeping reads cache-friendly at
// CloudFront (the cache key excludes Authorization). Only writes carry the bearer token.

import { API_BASE_URL } from '../config.mjs';

export async function getComments(pageUrl, { fetchImpl = fetch, nextToken } = {}) {
  const params = new URLSearchParams({ pageUrl });
  if (nextToken) params.set('nextToken', nextToken);
  const res = await fetchImpl(`${API_BASE_URL}/comments?${params.toString()}`, { method: 'GET' });
  if (!res.ok) throw new Error(`read failed: ${res.status}`);
  return res.json();
}

export async function postComment(pageUrl, body, getIdToken, { fetchImpl = fetch } = {}) {
  const send = (token) =>
    fetchImpl(`${API_BASE_URL}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
