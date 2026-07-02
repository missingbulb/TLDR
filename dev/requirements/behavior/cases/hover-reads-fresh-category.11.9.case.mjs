// 11.9 — The category used for a lookup is read FRESH from chrome.storage.local at hover time, never
// one cached when the content script first loaded: two hovers of the same link, with the current
// category changed in between (as the toolbar-icon menu would do — issue #25), must send two DIFFERENT
// categories in their lookup messages, with no page reload between them. The gallery show() renders
// the real two-hover walk as text.
"use strict";

// The one scenario both the assertion and the shown result drive — single-sourced.
const SCENARIO = {
  links: { link1: "https://example.com/article" },
  currentCategory: "tldr",
  onMessage: () => ({ comment: null }), // content doesn't matter for this leaf — only the outbound category
};
const SWITCH_TO = "spoiler";

export default {
  description: "the lookup's category is read fresh at hover time — a category switch changes what the next hover looks up",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/link-hover-harness.mjs");

    const session = await open(SCENARIO);
    try {
      session.hover("link1");
      await session.flushTimers();
      session.unhover("link1");

      // The toolbar-icon menu (issue #25) changes the current category via this same storage key —
      // simulate that switch directly, exactly as chrome.storage.local would reflect it.
      await session.chrome.storage.local.set({ currentCategory: SWITCH_TO });

      session.hover("link1");
      await session.flushTimers();

      const seenCategories = session.calls.sendMessage.map((m) => m.category);
      assert.deepEqual(seenCategories, ["tldr", SWITCH_TO], "the second hover uses the NEW category, not a stale cached one");
    } finally {
      session.close();
    }
  },
  show: async () => {
    const { hoverCategorySwitchLine } = await import("../show.mjs");
    return hoverCategorySwitchLine({ baseCase: SCENARIO, switchTo: SWITCH_TO });
  },
};
