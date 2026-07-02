// 11.8 — Hovering a candidate link with NO leading comment in the current category shows nothing —
// the owner-chosen empty state (no "no notes yet" placeholder). Also covers the denylisted-link case:
// a link on the per-site denylist never even sends a lookup message, let alone shows a popup. The
// gallery show() renders both real walks as text.
"use strict";

// The two scenarios both the assertions and the shown result drive — single-sourced.
const EMPTY_SCENARIO = {
  links: { link1: "https://example.com/quiet-page" },
  currentCategory: "spoiler",
  onMessage: () => ({ comment: null }), // the server's documented empty-state shape
};
const DENYLISTED_SCENARIO = {
  links: { link2: "https://google.com/search?q=x" },
  denylist: ["google.com"],
  onMessage: () => {
    throw new Error("must not be called — a denylisted link is never a lookup candidate");
  },
};

export default {
  description: "hovering a link with no leading comment (or a denylisted one) shows nothing",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/link-hover-harness.mjs");

    // --- a candidate link, but the category has no leading comment --------------------------------
    let session = await open(EMPTY_SCENARIO);
    try {
      session.hover("link1");
      await session.flushTimers();
      assert.equal(session.calls.sendMessage.length, 1, "the lookup still runs — it's a legitimate candidate");
      assert.equal(session.tooltipMounted(), false, "no popup for an empty category");
    } finally {
      session.close();
    }

    // --- a denylisted link: never even a candidate, so no lookup at all ---------------------------
    session = await open(DENYLISTED_SCENARIO);
    try {
      session.hover("link2");
      await session.flushTimers();
      assert.equal(session.calls.sendMessage.length, 0, "no message is ever sent for a denylisted host");
      assert.equal(session.tooltipMounted(), false);
    } finally {
      session.close();
    }
  },
  show: async () => {
    const { hoverShowsNothingLine } = await import("../show.mjs");
    return hoverShowsNothingLine({
      emptyCase: EMPTY_SCENARIO,
      emptyId: "link1",
      denylistedCase: DENYLISTED_SCENARIO,
      denylistedId: "link2",
    });
  },
};
