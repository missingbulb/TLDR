// 10.4 — A note is posted under the CURRENT top-level category (issue #25): no per-note picker, the
// composer posts whatever category the panel is currently showing. Behavior leaf: set the current
// category, post, and assert the POST body carries it and the new note appears in the current view.
"use strict";

export default {
  description: "posting attaches the current category to the note (POST body) and it shows in the current view",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", {
      tabUrl: "https://example.com/article",
      local: { currentCategory: "spoiler" },
      comments: [],
    });
    try {
      session.type("Ending spoiler below.");
      session.submit();
      await session.settle();

      const post = session.fetchLog.find((c) => c.method === "POST");
      assert.ok(post, "a POST went out");
      assert.equal(JSON.parse(post.body).category, "spoiler", "the note is posted under the current category");
      assert.equal(session.document.querySelectorAll(".comment-body").length, 1, "the new note shows in the current view");
    } finally {
      session.close();
    }
  },
};
