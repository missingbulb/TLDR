// 10.8 — POST /comments persists a valid category and toPublicComment returns it (issue #25). The
// server is the real boundary: the client half (the composer sends the category, 10.6) can only
// assume the write stores it. Here the real handler runs and we assert both the stored item and the
// echoed response carry the category.
"use strict";

export default {
  description: "POST persists a valid category and the public projection returns it",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { postComment, ddbMock, PutCommand, VALID_CLAIMS } = await import("../handler-harness.mjs");

    ddbMock.reset();
    const res = await postComment({ claims: VALID_CLAIMS, body: { pageUrl: "https://example.com/x", body: "hi", category: "spoiler" } });
    assert.equal(res.statusCode, 201);
    assert.equal(JSON.parse(res.body).comment.category, "spoiler", "the response echoes the stored category");

    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    assert.equal(item.category, "spoiler", "the category is stored on the comment item");
  },
};
