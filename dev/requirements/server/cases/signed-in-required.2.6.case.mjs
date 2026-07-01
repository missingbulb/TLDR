// 2.6 — Only signed-in people can post: the server rejects a write that carries no authenticated
// identity (401). This is the server enforcement behind the UI's "the write carries your signed-in
// token" (2.2) — a crafted client without a token can't get past the server.
"use strict";

// The one request both the assertion and the evidence card drive — single-sourced so the card can
// never depict inputs the assertion didn't run.
const REQUEST = { claims: {}, body: { pageUrl: "https://example.com/x", body: "hi" } };

export default {
  description: "a write with no signed-in identity is rejected (401)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { postComment } = await import("../handler-harness.mjs");
    const res = await postComment(REQUEST);
    assert.equal(res.statusCode, 401);
  },
  evidence: async () => {
    const { postComment } = await import("../handler-harness.mjs");
    const { serverTxnModel } = await import("../evidence.mjs");
    const res = await postComment(REQUEST);
    return serverTxnModel({
      id: "2.6",
      title: "signed-in-required",
      method: "POST",
      route: "/comments",
      request: [
        { k: "identity", v: "claims {} — no signed-in identity" },
        { k: "body", v: JSON.stringify(REQUEST.body) },
      ],
      res,
    });
  },
};
