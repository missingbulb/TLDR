// 2.8 — ⌘/Ctrl+Enter in the note box posts it (the keyboard shortcut for the Post button), while a
// bare Enter does not (it inserts a newline — notes are multi-line). Behavior leaf: a keyboard gesture
// a static snapshot can't show. Dispatch the two keydowns and assert only the modified one writes.
"use strict";

export default {
  description: "⌘/Ctrl+Enter posts the note; a bare Enter does not",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", { tabUrl: "https://example.com/article", comments: [] });
    try {
      const press = (init) =>
        session
          .el("body")
          .dispatchEvent(new session.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }));

      // A bare Enter must not post — it's a newline in a multi-line note.
      session.type("Draft still going.");
      press({});
      await session.settle();
      assert.equal(session.fetchLog.filter((c) => c.method === "POST").length, 0, "a bare Enter does not post");

      // ⌘+Enter posts through the same path as the Post button.
      press({ metaKey: true });
      await session.settle();
      const meta = session.fetchLog.filter((c) => c.method === "POST");
      assert.equal(meta.length, 1, "⌘+Enter posts the note");
      assert.equal(JSON.parse(meta[0].body).body, "Draft still going.", "the posted note carries the typed text");

      // Ctrl+Enter (win/linux) posts too.
      session.type("Second note.");
      press({ ctrlKey: true });
      await session.settle();
      const both = session.fetchLog.filter((c) => c.method === "POST");
      assert.equal(both.length, 2, "Ctrl+Enter posts as well");
      assert.equal(JSON.parse(both[1].body).body, "Second note.", "the second note carries its typed text");
    } finally {
      session.close();
    }
  },
};
