// 2.4 — An empty or whitespace-only body does not post and adds no note (no wasted write, no blank
// note).
"use strict";

export default {
  description: "a whitespace-only body does not post and adds no note",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", { tabUrl: "https://example.com/article", comments: [] });
    try {
      const readsBefore = session.fetchLog.length;
      session.type("   \n  ");
      session.submit();
      await session.settle();

      assert.equal(session.el("comments").querySelectorAll("li.comment").length, 0, "no note added");
      assert.equal(
        session.fetchLog.filter((c) => c.method === "POST").length,
        0,
        "no POST issued"
      );
      assert.equal(session.fetchLog.length, readsBefore, "no further network at all");
    } finally {
      session.close();
    }
  },
};
