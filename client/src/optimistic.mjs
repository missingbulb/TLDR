// Optimistic-render bookkeeping for the side panel. Pure logic — unit tested.
//
// The author sees their own comment immediately (before the ~30-60s CDN TTL lets others see it).
// We keep a small list of "local" comments (optimistic + just-confirmed) alongside the server list,
// and merge them deduped by commentId. Once a later GET includes the real commentId, the server
// record replaces the local one (dropping the pending flag).

export function makeOptimisticComment({ tempId, body, authorName, authorId, createdAt }) {
  return { commentId: tempId, body, authorName, authorId, createdAt, pending: true };
}

// Merge server + local comments, deduped by commentId (server wins), sorted by createdAt ascending.
export function mergeComments(serverComments = [], localComments = []) {
  const byId = new Map();
  for (const c of localComments) byId.set(c.commentId, c);
  for (const c of serverComments) byId.set(c.commentId, { ...c }); // authoritative; no pending flag
  return [...byId.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

// POST succeeded: replace the temp entry with the authoritative server record.
export function reconcileSuccess(localComments, tempId, authoritative) {
  return localComments.map((c) =>
    c.commentId === tempId ? { ...authoritative, pending: false } : c,
  );
}

// POST failed: keep the entry visible but mark it failed so the UI can offer a retry.
export function markFailed(localComments, tempId) {
  return localComments.map((c) =>
    c.commentId === tempId ? { ...c, pending: false, failed: true } : c,
  );
}
