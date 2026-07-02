// 11.7 — Hovering a candidate link (http(s), not denylisted) with a leading comment in the current
// category shows a popup — after the debounce — naming the category and the comment's body/author;
// moving off the link removes it. Drives the REAL client/src/link-hover.mjs under the dedicated
// link-hover harness (a synthetic third-party host page + a fake chrome, mirroring how harness.mjs
// drives the real sidepanel.mjs/options.mjs).
"use strict";

export default {
  description: "hovering a link with a leading comment shows a popup naming the category + comment; mouseout removes it",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/link-hover-harness.mjs");

    const session = await open({
      links: { link1: "https://example.com/article" },
      currentCategory: "tldr",
      onMessage: (message) => {
        assert.equal(message.type, "link-hover:getTopComment");
        assert.equal(message.pageUrl, "https://example.com/article");
        assert.equal(message.category, "tldr");
        return { comment: { commentId: "c1", body: "the gist of it", authorName: "Ada", voteCount: 5 } };
      },
    });
    try {
      assert.equal(session.tooltipMounted(), false, "nothing shows before the hover fires");

      session.hover("link1");
      assert.equal(session.tooltipMounted(), false, "not yet — the lookup is debounced");
      await session.flushTimers(); // fires the debounce, drains the async lookup + mount

      assert.equal(session.tooltipMounted(), true);
      assert.equal(session.calls.sendMessage.length, 1);
      const text = session.tooltipText();
      assert.match(text, /TLDR/, "names the current category");
      assert.match(text, /the gist of it/, "shows the comment body");
      assert.match(text, /Ada/, "shows the comment author");

      session.unhover("link1");
      assert.equal(session.tooltipMounted(), false, "moving off the link removes the popup");
    } finally {
      session.close();
    }
  },
};
