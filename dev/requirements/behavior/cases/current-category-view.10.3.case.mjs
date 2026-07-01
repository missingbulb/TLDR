// 10.3 — The panel shows ONLY the current category's notes, and switching the current category (as the
// toolbar menu does, via chrome.storage) re-renders to the new category WITHOUT a refetch (issue #25).
// Non-visual (which rows show + no new GET), so a behavior leaf: seed mixed-category notes, assert only
// the current shows, switch the stored category, assert the view follows with no extra GET.
"use strict";

export default {
  description: "the panel shows only the current category's notes; switching category re-renders without a refetch",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", {
      tabUrl: "https://example.com/article",
      local: { currentCategory: "tldr" },
      comments: [
        { commentId: "t1", body: "The gist in one line.", authorName: "Ada", createdAt: 1, category: "tldr" },
        { commentId: "s1", body: "The butler did it.", authorName: "Sam", createdAt: 2, category: "spoiler" },
      ],
    });
    try {
      const bodies = () => [...session.document.querySelectorAll(".comment-body")].map((e) => e.textContent);
      const getCount = () => session.fetchLog.filter((c) => c.method === "GET").length;

      assert.deepEqual(bodies(), ["The gist in one line."], "only the current category (tldr) shows");
      assert.equal(session.document.body.dataset.category, "tldr", "the panel wears the current category");
      const getsBefore = getCount();

      // Switch the current category the same way the toolbar menu does — a storage write the panel watches.
      await session.chrome.storage.local.set({ currentCategory: "spoiler" });
      await session.settle();

      assert.deepEqual(bodies(), ["The butler did it."], "the view follows the switch to spoiler");
      assert.equal(session.document.body.dataset.category, "spoiler", "and the panel re-wears the new category");
      assert.equal(getCount(), getsBefore, "the switch re-rendered from cache — no new GET");
    } finally {
      session.close();
    }
  },
};
