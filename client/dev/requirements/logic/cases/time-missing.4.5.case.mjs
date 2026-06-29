// 4.5 — A note with no timestamp shows no time (an empty time, never a bogus date or "NaN").
"use strict";

export default {
  description: "a note with no timestamp shows an empty time",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { noteMetaFor } = await import("../../shared/render/note-meta.mjs");
    assert.equal(await noteMetaFor(undefined), "Ann · ");
  },
};
