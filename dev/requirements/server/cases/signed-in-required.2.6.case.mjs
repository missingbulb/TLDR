// 2.6 — Only signed-in people can post: the server rejects a write that carries no authenticated
// identity (401). This is the server enforcement behind the UI's "the write carries your signed-in
// token" (2.2) — a crafted client without a token can't get past the server.
"use strict";

export default {
  description: "a write with no signed-in identity is rejected (401)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { postComment } = await import("../handler-harness.mjs");
    const res = await postComment({ claims: {}, body: { pageUrl: "https://example.com/x", body: "hi" } });
    assert.equal(res.statusCode, 401);
  },
};
