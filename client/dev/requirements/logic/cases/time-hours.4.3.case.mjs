// 4.3 — A note hours old reads "Nh ago".
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  description: "a note hours old reads \"Nh ago\"",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { noteMetaFor } = await import("../../shared/render/note-meta.mjs");
    assert.equal(await noteMetaFor(REFERENCE_NOW_MS - 3 * 3_600_000), "Ann · 3h ago");
  },
};
