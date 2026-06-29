// 2.1 — Submitting a note renders it immediately (optimistically) and disables Post while in flight.
// The post is frozen mid-flight so we observe the optimistic state itself, before any server reply.
"use strict";

export default {
  description: "submitting a note inserts it optimistically and disables Post",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", { tabUrl: "https://example.com/article", comments: [], postHangs: true });
    try {
      session.type("Great read.");
      session.submit();
      // Assert the OPTIMISTIC state immediately — before any await — to prove it shows "at once".
      const items = session.el("comments").querySelectorAll("li.comment");
      assert.equal(items.length, 1, "the note appears immediately");
      assert.ok(items[0].classList.contains("pending"), "it is marked pending");
      assert.equal(items[0].querySelector(".comment-body").textContent, "Great read.");
      assert.match(items[0].querySelector(".comment-meta").textContent, /posting…$/);
      assert.equal(session.el("post").disabled, true, "Post is disabled while in flight");
      assert.equal(session.el("body").value, "", "the textarea is cleared");
      // Let the in-flight write run and PARK on the frozen post (postHangs) while the fakes are still
      // installed — so no app async touches a torn-down global after the test ends. It never resolves,
      // so the note stays pending: the assertions above remain true.
      await session.settle();
      assert.ok(items[0].classList.contains("pending"), "still pending while the write is frozen in flight");
    } finally {
      session.close();
    }
  },
};
