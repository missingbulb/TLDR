// 6.3 — The "Saved." confirmation is transient: it clears a short time after the save. The auto-clear
// timer is captured by the harness (not run on the real clock), so the test advances it explicitly
// with flushTimers() rather than waiting — deterministic and instant.
"use strict";

export default {
  description: "the \"Saved.\" confirmation clears shortly after",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("options", { stored: [] });
    try {
      session.type("example.com");
      session.submit();
      await session.settle();
      assert.equal(session.text("saved"), "Saved.", "shows the confirmation");

      session.flushTimers(); // run the captured auto-clear timer
      assert.equal(session.text("saved"), "", "the confirmation has cleared");
    } finally {
      session.close();
    }
  },
};
