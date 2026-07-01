// 9.5 — A failed vote write rolls the count and affordance back, so a rejected vote leaves no phantom
// count. Drive the click with the write mocked to fail (postFails) and assert the row returns to its
// pre-click state and the failure was logged (console.warn, captured by the harness).
"use strict";

export default {
  description: "a failed vote write rolls the count/affordance back (no phantom vote)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", {
      tabUrl: "https://example.com/article",
      comments: [{ commentId: "c-fail", body: "This one won't stick.", authorName: "Ada", createdAt: 1, voteCount: 3 }],
      postFails: true,
    });
    try {
      const btn = () => session.document.querySelector("li.comment .vote");
      btn().click();
      await session.settle();

      assert.equal(btn().getAttribute("aria-pressed"), "false", "rolled back to un-voted");
      assert.match(btn().textContent, /3/, "count restored — no phantom vote");
      assert.ok(session.warnings.some((w) => /vote failed/.test(w)), "the failure is logged");
    } finally {
      session.close();
    }
  },
};
