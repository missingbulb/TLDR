// 2.2 — On a successful post the optimistic note reconciles to a confirmed note (the pending
// treatment drops) and Post re-enables. The write carries a bearer token; the read does not (reads
// are public/cache-friendly) — the auth split the user never sees but depends on.
"use strict";

export default {
  description: "a successful post reconciles to a confirmed note, re-enables Post, and carries a bearer token",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", { tabUrl: "https://example.com/article", comments: [] });
    try {
      session.type("Nicely argued.");
      session.submit();
      await session.settle();

      const items = session.el("comments").querySelectorAll("li.comment");
      assert.equal(items.length, 1);
      assert.ok(!items[0].classList.contains("pending"), "no longer pending");
      assert.ok(!items[0].classList.contains("failed"), "not failed");
      assert.equal(items[0].querySelector(".comment-body").textContent, "Nicely argued.");
      assert.equal(session.el("post").disabled, false, "Post is re-enabled");
      assert.equal(session.el("body").value, "", "the textarea stays cleared");
      assert.equal(session.el("composer-error").textContent, "", "no error");

      const read = session.fetchLog.find((c) => c.method === "GET");
      const write = session.fetchLog.find((c) => c.method === "POST");
      assert.ok(read && !("authorization" in (read.headers || {})), "the read carries no Authorization header");
      assert.ok(write && String(write.headers.authorization || "").startsWith("Bearer "), "the write carries a bearer token");
    } finally {
      session.close();
    }
  },
};
