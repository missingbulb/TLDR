// 2.3 — When a post fails, the note is marked failed, the composer shows "Could not post — try
// again.", and Post re-enables so the user can retry — the text is never silently dropped.
"use strict";

export default {
  description: "a failed post marks the note failed and shows the composer error",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", { tabUrl: "https://example.com/article", comments: [], authFails: true });
    try {
      session.type("This one fails.");
      session.submit();
      await session.settle();

      const items = session.el("comments").querySelectorAll("li.comment");
      assert.equal(items.length, 1, "the note stays visible");
      assert.ok(items[0].classList.contains("failed"), "it is marked failed");
      assert.match(items[0].querySelector(".comment-meta").textContent, /failed to post$/);
      assert.equal(session.el("composer-error").textContent, "Could not post — try again.");
      assert.equal(session.el("post").disabled, false, "Post is re-enabled for a retry");
    } finally {
      session.close();
    }
  },
};
