// 6.2 — Saving the denylist normalizes it (trim, lowercase, drop blank lines) and dedupes, then
// persists it to chrome.storage.sync and confirms with "Saved.". The normalized list is also
// reflected back into the textarea.
"use strict";

const DENYLIST_KEY = "userDenylist";

export default {
  description: "saving normalizes + dedupes the denylist, persists it, and confirms",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("options", { stored: ["existing.com"] });
    try {
      session.type("Google.com\n  google.com \nExample.ORG\n\nexisting.com");
      session.submit();
      await session.settle();

      assert.equal(session.calls.syncSet.length, 1, "persisted exactly once");
      assert.deepEqual(
        session.calls.syncSet[0][DENYLIST_KEY],
        ["google.com", "example.org", "existing.com"],
        "trimmed, lowercased, blanks dropped, deduped, first-seen order"
      );
      assert.equal(session.text("saved"), "Saved.", "confirms the save");
      assert.equal(session.el("denylist").value, "google.com\nexample.org\nexisting.com", "textarea reflects the normalized list");
    } finally {
      session.close();
    }
  },
};
