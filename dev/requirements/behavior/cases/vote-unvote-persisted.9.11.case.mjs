// 9.11 — A comment you already upvoted in a previous session (persisted in chrome.storage.local, then
// overlaid onto the read on load) shows as VOTED on open, and clicking it REMOVES the vote — a DELETE,
// never a second cast. Proves the "you already voted → unvote" flow end-to-end (the persistence
// overlay + the toggle-off), so a viewer can't stack a second vote, only take theirs back.
"use strict";

export default {
  description: "an already-voted comment (persisted) shows voted on load; clicking removes the vote (unvote)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", {
      tabUrl: "https://example.com/article",
      comments: [{ commentId: "c-mine", body: "Already mine.", authorName: "You", createdAt: 1, voteCount: 5 }],
      local: { myVotes: ["c-mine"] }, // voted in a previous session
    });
    try {
      const btn = () => session.document.querySelector("li.comment .vote");
      const count = () => session.document.querySelector("li.comment .vote-count").textContent;

      // Shown as voted on load — the overlay from storage.local — with the stored count.
      assert.equal(btn().getAttribute("aria-pressed"), "true", "shows you already voted");
      assert.equal(count(), "5");

      // Clicking removes the vote (a DELETE, not a second cast): count drops, flips to un-voted.
      btn().click();
      await session.settle();
      assert.equal(btn().getAttribute("aria-pressed"), "false", "clicking unvotes");
      assert.equal(count(), "4", "count decremented");

      const votes = session.fetchLog.filter((c) => /\/vote$/.test(c.url));
      assert.deepEqual(votes.map((v) => v.method), ["DELETE"], "an unvote (DELETE), never a second cast");
    } finally {
      session.close();
    }
  },
};
