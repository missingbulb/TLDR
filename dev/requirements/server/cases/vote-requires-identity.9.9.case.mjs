// 9.9 — A vote with no signed-in identity is rejected (401). Voting is attributed — the guarantee is
// the server's, exactly like posting (2.6) — while reads stay public. An error path: the handler
// rejects before any DynamoDB call, so no mock is needed.
"use strict";

export default {
  description: "a vote with no signed-in identity is rejected (401) — voting is attributed, reads stay public",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { vote } = await import("../handler-harness.mjs");
    const res = await vote({ claims: {}, body: { pageUrl: "https://example.com/x" } });
    assert.equal(res.statusCode, 401);
  },
};
