// 9.10 — The public read projection returns voteCount and never leaks per-voter identity. The
// allowlist projection surfaces the count (so the UI can show it) but no voter's `voterSub` — nor any
// other internal field — so the shared, world-readable cached read can't expose who voted.
"use strict";

export default {
  description: "the public read returns voteCount and never leaks per-voter identity",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { getComments, ddbMock, QueryCommand } = await import("../handler-harness.mjs");

    ddbMock.reset();
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          pageId: "https://example.com/x",
          commentId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          authorSub: "author-1",
          authorName: "Ada",
          body: "hi",
          createdAt: 1700000000000,
          voteCount: 12,
          voterSub: "voter-should-never-surface", // an internal vote-bookkeeping field
          authorEmailHash: "deadbeef", // a moderation-only field that must never surface
        },
      ],
    });

    const res = await getComments({ pageUrl: "https://example.com/x" });
    assert.equal(res.statusCode, 200);
    const c = JSON.parse(res.body).comments[0];
    assert.equal(c.voteCount, 12, "the endorsement count is returned");
    assert.ok(!("voterSub" in c), "a voter's identity never surfaces in the public read");
    assert.ok(!("authorEmailHash" in c) && !("authorSub" in c), "no internal identity field leaks");
  },
};
