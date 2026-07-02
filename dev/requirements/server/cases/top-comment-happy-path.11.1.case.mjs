// 11.1 — GET /comments/top?pageUrl=…&category=… queries the CategoryRankIndex GSI (keyed on
// pageId#category, sorted by voteCount) and returns the single highest-voteCount comment through the
// SAME public allowlist projection as GET /comments — no internal field (categoryPageId, authorSub)
// leaks. This is the link-hover preview's (issue #26) "leading comment" lookup.
"use strict";

// The one stored item both the assertion and the shown result drive — single-sourced so what's shown
// can never depict a fixture the assertion didn't actually run against.
const STORED_ITEM = {
  pageId: "https://example.com/x",
  commentId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  authorSub: "user-123",
  authorName: "Ada",
  body: "the leading note",
  category: "tldr",
  createdAt: 1700000000000,
  voteCount: 9,
  categoryPageId: "https://example.com/x#tldr", // internal GSI key — must not leak
};

async function run() {
  const { getTopComment, ddbMock, QueryCommand } = await import("../handler-harness.mjs");
  ddbMock.reset();
  ddbMock.on(QueryCommand).resolves({ Items: [STORED_ITEM] });
  const res = await getTopComment({ pageUrl: "https://example.com/x", category: "tldr" });
  return { res, ddbMock, QueryCommand };
}

export default {
  description: "GET /comments/top returns the highest-voteCount comment via the CategoryRankIndex GSI, publicly projected",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { res, ddbMock, QueryCommand } = await run();

    assert.equal(res.statusCode, 200);
    const { comment } = JSON.parse(res.body);
    assert.deepEqual(
      Object.keys(comment).sort(),
      ["authorId", "authorName", "body", "category", "commentId", "createdAt", "voteCount"],
      "same allowlist projection as GET /comments — categoryPageId/authorSub never leak",
    );
    assert.equal(comment.body, "the leading note");
    assert.equal(comment.voteCount, 9);

    const query = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    assert.equal(query.IndexName, "CategoryRankIndex");
    assert.equal(query.ExpressionAttributeValues[":categoryPageId"], "https://example.com/x#tldr");
    assert.equal(query.ScanIndexForward, false, "highest voteCount first");
    assert.equal(query.Limit, 1);
  },
  show: async () => {
    const { serverTxnLine } = await import("../show.mjs");
    const { res } = await run();
    return serverTxnLine({ method: "GET", route: "/comments/top?pageUrl=https://example.com/x&category=tldr", identity: "public", res });
  },
};
