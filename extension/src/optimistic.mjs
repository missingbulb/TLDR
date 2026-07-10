// Optimistic-render bookkeeping for the side panel. Pure logic — unit tested.
//
// The author sees their own comment immediately (before the ~30-60s CDN TTL lets others see it).
// We keep a small list of "local" comments (optimistic + just-confirmed) alongside the server list,
// and merge them deduped by commentId. Once a later GET includes the real commentId, the server
// record replaces the local one (dropping the pending flag).

export function makeOptimisticComment({ tempId, body, authorName, authorId, createdAt, category }) {
  // Carry the composer-selected category so the note's badge shows immediately, before the ~30–60s
  // CDN TTL lets a later GET return the authoritative record (which reconcileSuccess swaps in). (issue #25)
  return { commentId: tempId, body, authorName, authorId, createdAt, category, pending: true };
}

// Merge server + local comments, deduped by commentId (server wins), sorted by createdAt ascending.
export function mergeComments(serverComments = [], localComments = []) {
  const byId = new Map();
  for (const c of localComments) byId.set(c.commentId, c);
  for (const c of serverComments) {
    const prev = byId.get(c.commentId);
    // The server record is authoritative (incl. voteCount), but it can't know YOUR vote — the public
    // read is shared and CDN-cached, with the cache key excluding Authorization — so a refresh keeps
    // the server's count while preserving the locally-known `youVoted` (issue #22).
    byId.set(c.commentId, { ...c, youVoted: c.youVoted ?? prev?.youVoted });
  }
  return [...byId.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

// Optimistically toggle the viewer's vote on one comment: flip `youVoted` and move `voteCount` by ±1
// (floored at 0). Pure and self-inverse — to roll back a failed write, call it again with the prior
// `voted`. A no-op on any list that doesn't hold the comment, so the panel can apply it to both the
// server and local lists without knowing which one the row lives in (issue #22).
export function applyVoteToggle(comments, commentId, voted) {
  return comments.map((c) =>
    c.commentId === commentId
      ? { ...c, youVoted: voted, voteCount: Math.max(0, (c.voteCount ?? 0) + (voted ? 1 : -1)) }
      : c,
  );
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
