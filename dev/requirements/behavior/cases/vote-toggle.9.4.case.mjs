// 9.4 — Clicking the upvote optimistically increments the count and flips to voted; clicking again
// toggles it back (count restored). Non-visual timing + the exact network verbs a static snapshot
// can't show, so it's a behavior leaf: drive the real click twice and assert the DOM state and that a
// cast (POST) then a remove (DELETE) went out. render() rebuilds the row each time, so re-query it.
"use strict";

export default {
  description: "clicking optimistically increments and flips to voted; clicking again toggles back",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", {
      tabUrl: "https://example.com/article",
      comments: [{ commentId: "c-vote", body: "Worth a vote.", authorName: "Ada", createdAt: 1, voteCount: 3 }],
    });
    try {
      const btn = () => session.document.querySelector("li.comment .vote");
      const count = () => session.document.querySelector("li.comment .vote-count").textContent;
      assert.equal(btn().getAttribute("aria-pressed"), "false");
      assert.equal(count(), "3");

      btn().click(); // cast
      await session.settle();
      assert.equal(btn().getAttribute("aria-pressed"), "true", "optimistically flips to voted");
      assert.equal(count(), "4", "count incremented optimistically");

      btn().click(); // toggle back off
      await session.settle();
      assert.equal(btn().getAttribute("aria-pressed"), "false", "flips back to un-voted");
      assert.equal(count(), "3", "count restored");

      const votes = session.fetchLog.filter((c) => /\/vote$/.test(c.url));
      assert.deepEqual(votes.map((v) => v.method), ["POST", "DELETE"], "a cast then a remove");
    } finally {
      session.close();
    }
  },
};
