// 3.5 — A note over the size limit (~8 KB) is rejected by the server (413), even if a client bypasses
// the note box's maxlength. This is the real enforcement behind the UI cap in 3.4 — the textarea
// maxlength is a convenience; the server is the guarantee.
"use strict";

export default {
  description: "an oversized note is rejected by the server (413)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { postComment, VALID_CLAIMS } = await import("../handler-harness.mjs");
    const res = await postComment({
      claims: VALID_CLAIMS,
      body: { pageUrl: "https://example.com/x", body: "x".repeat(9000) }, // > the 8192-byte cap
    });
    assert.equal(res.statusCode, 413);
  },
};
