// 2.7 — A verified Google email is required to post: a signed-in user whose email isn't verified is
// rejected (403). The server's second auth gate, behind the UI sign-in.
"use strict";

const REQUEST = {
  claims: { sub: "user-123", name: "Ada", email_verified: "false" },
  body: { pageUrl: "https://example.com/x", body: "hi" },
};

export default {
  description: "a signed-in user without a verified email is rejected (403)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { postComment } = await import("../handler-harness.mjs");
    const res = await postComment(REQUEST);
    assert.equal(res.statusCode, 403);
  },
  show: async () => {
    const { postComment } = await import("../handler-harness.mjs");
    const { serverTxnLine } = await import("../show.mjs");
    const res = await postComment(REQUEST);
    return serverTxnLine({ method: "POST", route: "/comments", identity: "sub user-123 · email_verified=false", body: REQUEST.body, res });
  },
};
