// 10.7 — The toolbar-icon category menu (issue #25): picking a category records it as the current
// category (chrome.storage.local — the key the panel reads/watches) and opens the side panel. Behavior
// leaf driving the REAL menu page (category-menu.mjs) under the harness's "menu" surface. (The service
// worker's open/close toggle glue is chrome runtime plumbing covered by the real-browser e2e, §8.1.)
"use strict";

export default {
  description: "picking a category in the toolbar menu records the current category and opens the side panel",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("menu", { tabUrl: "https://example.com/article" });
    try {
      const btn = session.document.querySelector('[data-category="spoiler"]');
      assert.ok(btn, "the menu lists a Spoiler button");
      btn.click();
      await session.settle();

      const stored = await session.chrome.storage.local.get("currentCategory");
      assert.equal(stored.currentCategory, "spoiler", "the picked category is recorded as the current category");
      assert.equal(session.calls.sidePanelOpen, 1, "picking a category opens the side panel");
    } finally {
      session.close();
    }
  },
};
