// 11.9 — The category used for a lookup is read FRESH from chrome.storage.local at hover time, never
// one cached when the content script first loaded: two hovers of the same link, with the current
// category changed in between (as the toolbar-icon menu would do — issue #25), must send two DIFFERENT
// categories in their lookup messages, with no page reload between them.
"use strict";

export default {
  description: "the lookup's category is read fresh at hover time — a category switch changes what the next hover looks up",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/link-hover-harness.mjs");

    const seenCategories = [];
    const session = await open({
      links: { link1: "https://example.com/article" },
      currentCategory: "tldr",
      onMessage: (message) => {
        seenCategories.push(message.category);
        return { comment: null }; // content doesn't matter for this leaf — only the outbound category
      },
    });
    try {
      session.hover("link1");
      await session.flushTimers();
      session.unhover("link1");

      // The toolbar-icon menu (issue #25) changes the current category via this same storage key —
      // simulate that switch directly, exactly as chrome.storage.local would reflect it.
      await session.chrome.storage.local.set({ currentCategory: "spoiler" });

      session.hover("link1");
      await session.flushTimers();

      assert.deepEqual(seenCategories, ["tldr", "spoiler"], "the second hover uses the NEW category, not a stale cached one");
    } finally {
      session.close();
    }
  },
};
