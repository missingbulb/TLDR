// 10.9 — POST /comments with an UNKNOWN category is rejected (400) and nothing is written; with NO
// category it stores the default (issue #25). The growable curated list is a server-side allowlist
// (not a frozen enum): a client only ever offers known categories, so an unknown one is a bug → 400,
// while an absent one is the additive-only optional field that defaults server-side.
"use strict";

export default {
  description: "POST rejects an unknown category (400); a missing category stores the default",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { postComment, ddbMock, PutCommand, VALID_CLAIMS } = await import("../handler-harness.mjs");

    // Unknown category → 400, no write.
    ddbMock.reset();
    let res = await postComment({ claims: VALID_CLAIMS, body: { pageUrl: "https://example.com/x", body: "hi", category: "rating" } });
    assert.equal(res.statusCode, 400, "an unknown category is rejected");
    assert.equal(ddbMock.commandCalls(PutCommand).length, 0, "nothing is written on a rejected category");

    // No category → stored default (chitchat).
    ddbMock.reset();
    res = await postComment({ claims: VALID_CLAIMS, body: { pageUrl: "https://example.com/x", body: "hi" } });
    assert.equal(res.statusCode, 201);
    assert.equal(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item.category, "chitchat", "a missing category defaults server-side");
  },
};
