// 4.1 — A note less than a minute old reads "just now". Verified through the real render (the
// formatter is private to sidepanel.mjs) by rendering one note at a fixed offset from the pinned
// reference instant and reading its meta line.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  description: "a note under a minute old reads \"just now\"",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { noteMetaFor } = await import("../../shared/render/note-meta.mjs");
    assert.equal(await noteMetaFor(REFERENCE_NOW_MS - 30_000), "Ann · just now");
  },
};
