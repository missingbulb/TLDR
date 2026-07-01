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
  evidence: async () => {
    const { postComment } = await import("../handler-harness.mjs");
    const { serverTxnModel } = await import("../evidence.mjs");
    const res = await postComment(REQUEST);
    return serverTxnModel({
      id: "2.7",
      title: "verified-email-required",
      method: "POST",
      route: "/comments",
      request: [
        { k: "identity", v: "sub user-123 · email_verified = false" },
        { k: "body", v: JSON.stringify(REQUEST.body) },
      ],
      res,
    });
  },
};
