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
  show: async () => {
    const { vote } = await import("../handler-harness.mjs");
    const { serverTxnLine } = await import("../show.mjs");
    const res = await vote(REQUEST);
    return serverTxnLine({ method: "POST", route: "/comments/{commentId}/vote", identity: "no auth", body: REQUEST.body, res });
  },
};
