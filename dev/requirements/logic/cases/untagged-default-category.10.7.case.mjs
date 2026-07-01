// 10.7 — An untagged comment (one carrying no `category`) renders under the DEFAULT category, never a
// blank/undefined badge (issue #25). A non-visual defaulting rule, so it's a logic leaf: render a
// comment with no category through the real panel and assert its badge reads the default label
// (Chitchat), matching what the server projects for a legacy row at read time.
"use strict";

export default {
  description: "an untagged comment renders under the default category (Chitchat), never a blank badge",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const { DEFAULT_CATEGORY, categoryLabel } = await import("../../../../client/vendor/categories.GENERATED.mjs");
    // A note with NO category field — e.g. a row written before categories existed.
    const session = await open("sidepanel", {
      tabUrl: "https://example.com/article",
      comments: [{ commentId: "legacy", body: "An old note.", authorName: "Ada", createdAt: 1 }],
    });
    try {
      const badge = session.document.querySelector(".comment .cat-badge");
      assert.ok(badge, "the note still renders a category badge");
      assert.equal(badge.textContent, categoryLabel(DEFAULT_CATEGORY), "an untagged note shows the default category label");
      assert.notEqual(badge.textContent.trim(), "", "the badge is never blank/undefined");
    } finally {
      session.close();
    }
  },
};
