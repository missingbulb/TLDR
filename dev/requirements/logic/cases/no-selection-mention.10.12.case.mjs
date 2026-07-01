// 10.12 — The comments pane makes NO mention of the current selection (issue #25, owner requirement):
// it "just shows the relevant comments". No per-note category badge, no filter bar, and the comments
// area itself never names the current category — the category is conveyed only by the panel's look &
// feel and the composer copy (§10.1/§10.5), not by any label in the notes. A non-visual structural
// rule → a logic leaf, asserted against the real rendered panel.
"use strict";

export default {
  description: "the comments pane makes no mention of the current category (no badge, no filter bar, category unnamed)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", {
      tabUrl: "https://example.com/article",
      local: { currentCategory: "spoiler" },
      comments: [{ commentId: "s1", body: "The butler did it.", authorName: "Sam", createdAt: 1, category: "spoiler" }],
    });
    try {
      assert.equal(session.document.querySelectorAll(".cat-badge").length, 0, "no per-note category badge");
      assert.equal(session.document.querySelectorAll(".filters, [data-filter]").length, 0, "no category filter bar");
      // The comments region never names the current category (the composer's 'Post spoiler' copy is not here).
      const commentsText = session.el("comments").textContent;
      assert.ok(!/spoiler/i.test(commentsText), "the comments make no mention of the current category");
      // …and the current category's note still renders (the pane shows the relevant comments).
      assert.equal(session.document.querySelectorAll(".comment-body").length, 1, "the current category's note still shows");
    } finally {
      session.close();
    }
  },
};
