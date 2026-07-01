// 10.3 — Selecting a category tab shows ONLY that category's notes, and re-renders from the
// already-fetched notes WITHOUT a refetch (issue #25). Non-visual (it's about which rows are shown and
// that no new GET fires), so it's a behavior leaf: drive the real tab click and assert the filtered
// DOM plus that the GET count is unchanged (client-side filtering preserves the one CDN-cached read).
"use strict";

export default {
  description: "selecting a category tab shows only that category's notes and does not refetch",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", {
      tabUrl: "https://example.com/article",
      comments: [
        { commentId: "t1", body: "The gist in one line.", authorName: "Ada", createdAt: 1, category: "tldr" },
        { commentId: "s1", body: "The butler did it.", authorName: "Sam", createdAt: 2, category: "spoiler" },
      ],
    });
    try {
      const bodies = () => [...session.document.querySelectorAll(".comment-body")].map((e) => e.textContent);
      const getCount = () => session.fetchLog.filter((c) => c.method === "GET").length;

      assert.deepEqual(bodies(), ["The gist in one line.", "The butler did it."], "All shows every note");
      const getsBefore = getCount();

      session.document.querySelector('[data-filter="spoiler"]').click();
      await session.settle();
      assert.deepEqual(bodies(), ["The butler did it."], "only the spoiler note shows once the filter is active");
      assert.equal(getCount(), getsBefore, "switching the filter did not trigger a new GET");

      // Back to All restores the full list — still no refetch.
      session.document.querySelector('[data-filter="all"]').click();
      await session.settle();
      assert.deepEqual(bodies(), ["The gist in one line.", "The butler did it."], "All restores every note");
      assert.equal(getCount(), getsBefore, "returning to All did not refetch either");
    } finally {
      session.close();
    }
  },
};
