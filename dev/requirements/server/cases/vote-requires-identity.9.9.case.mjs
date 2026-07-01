// 9.9 — A vote with no signed-in identity is rejected (401). Voting is attributed — the guarantee is
// the server's, exactly like posting (2.6) — while reads stay public. An error path: the handler
// rejects before any DynamoDB call, so no mock is needed.
"use strict";

const REQUEST = { method: "POST", claims: {}, body: { pageUrl: "https://example.com/x" } };

export default {
  description: "a vote with no signed-in identity is rejected (401) — voting is attributed, reads stay public",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { vote } = await import("../handler-harness.mjs");
    const res = await vote(REQUEST);
    assert.equal(res.statusCode, 401);
  },
  evidence: async () => {
    const { vote } = await import("../handler-harness.mjs");
    const { serverTxnModel } = await import("../evidence.mjs");
    const res = await vote(REQUEST);
    return serverTxnModel({
      id: "9.9",
      title: "vote-requires-identity",
      method: "POST",
      route: "/comments/{commentId}/vote",
      request: [
        { k: "identity", v: "claims {} — no signed-in identity" },
        { k: "body", v: JSON.stringify(REQUEST.body) },
      ],
      res,
    });
  },
};
