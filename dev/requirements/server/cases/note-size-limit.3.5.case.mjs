// 3.5 — A note over the size limit (~8 KB) is rejected by the server (413), even if a client bypasses
// the note box's maxlength. This is the real enforcement behind the UI cap in 3.4 — the textarea
// maxlength is a convenience; the server is the guarantee.
"use strict";

const OVERSIZE = "x".repeat(9000); // > the 8192-byte cap
// A fully valid signed-in user (values mirror the harness VALID_CLAIMS) so the ONLY thing that trips
// the gate is the body size — inlined rather than imported so loading the case pulls in no AWS SDK.
const REQUEST = {
  claims: { sub: "user-123", name: "Ada", email: "ada@example.com", email_verified: "true" },
  body: { pageUrl: "https://example.com/x", body: OVERSIZE },
};

export default {
  description: "an oversized note is rejected by the server (413)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { postComment } = await import("../handler-harness.mjs");
    const res = await postComment(REQUEST);
    assert.equal(res.statusCode, 413);
  },
  evidence: async () => {
    const { postComment } = await import("../handler-harness.mjs");
    const { serverTxnModel } = await import("../evidence.mjs");
    const res = await postComment(REQUEST);
    return serverTxnModel({
      id: "3.5",
      title: "note-size-limit",
      method: "POST",
      route: "/comments",
      request: [
        { k: "identity", v: "a verified signed-in user" },
        { k: "body", v: `${OVERSIZE.length} bytes — over the 8192-byte cap` },
      ],
      res,
    });
  },
};
