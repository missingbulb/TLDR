// 10.6 — Posting carries the composer-selected category: it appears on the optimistic note's badge
// immediately AND is sent in the POST body (issue #25). Non-visual timing + the exact wire field a
// static snapshot can't show, so it's a behavior leaf: pick a category, post, and assert both the
// rendered badge and the request body.
"use strict";

export default {
  description: "posting carries the composer-selected category into the optimistic note and the POST body",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", { tabUrl: "https://example.com/article", comments: [] });
    try {
      // Choose a non-default category in the composer, then post.
      session.document.getElementById("category").value = "spoiler";
      session.type("Ending spoiler below.");
      session.submit();
      await session.settle();

      const badges = [...session.document.querySelectorAll(".comment .cat-badge")].map((e) => e.textContent);
      assert.deepEqual(badges, ["Spoiler"], "the note shows the selected category badge immediately");

      const post = session.fetchLog.find((c) => c.method === "POST");
      assert.ok(post, "a POST went out");
      assert.equal(JSON.parse(post.body).category, "spoiler", "the write body carries the selected category");
    } finally {
      session.close();
    }
  },
};
