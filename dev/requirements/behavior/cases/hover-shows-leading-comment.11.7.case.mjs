// 11.7 — Hovering a candidate link (http(s), not denylisted) with a leading comment in the current
// category shows a popup — after the debounce — naming the category and the comment's body/author;
// moving off the link removes it. Drives the REAL client/src/link-hover.mjs under the dedicated
// link-hover harness (a synthetic third-party host page + a fake chrome, mirroring how harness.mjs
// drives the real sidepanel.mjs/options.mjs). The gallery show() renders this same walk as text (the
// outbound lookup + the popup's actual content); the popup's LOOK is pinned by the component leaf 11.12.
"use strict";

// The one scenario both the assertion and the shown result drive. Single-sourced so what's shown
// can't depict a different run than the one verify() gates.
const SCENARIO = {
  links: { link1: "https://example.com/article" },
  currentCategory: "tldr",
  onMessage: () => ({ comment: { commentId: "c1", body: "the gist of it", authorName: "Ada", voteCount: 5 } }),
};

export default {
  description: "hovering a link with a leading comment shows a popup naming the category + comment; mouseout removes it",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/link-hover-harness.mjs");

    const session = await open(SCENARIO);
    try {
      assert.equal(session.tooltipMounted(), false, "nothing shows before the hover fires");

      session.hover("link1");
      assert.equal(session.tooltipMounted(), false, "not yet — the lookup is debounced");
      await session.flushTimers(); // fires the debounce, drains the async lookup + mount

      assert.equal(session.calls.sendMessage.length, 1);
      // The outbound lookup carries the hovered link's normalized URL and the CURRENT category.
      assert.deepEqual(session.calls.sendMessage[0], {
        type: "link-hover:getTopComment",
        pageUrl: "https://example.com/article",
        category: "tldr",
      });

      assert.equal(session.tooltipMounted(), true);
      const parts = session.tooltipParts();
      assert.equal(parts.label, "TLDR", "names the current category");
      assert.equal(parts.body, "the gist of it", "shows the comment body");
      assert.equal(parts.meta, "Ada", "shows the comment author");

      session.unhover("link1");
      assert.equal(session.tooltipMounted(), false, "moving off the link removes the popup");
    } finally {
      session.close();
    }
  },
  show: async () => {
    const { hoverShowsPopupLine } = await import("../show.mjs");
    return hoverShowsPopupLine({ baseCase: SCENARIO });
  },
};
