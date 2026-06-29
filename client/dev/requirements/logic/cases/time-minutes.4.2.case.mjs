// 4.2 — A note minutes old reads "Nm ago".
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  description: "a note minutes old reads \"Nm ago\"",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { noteMetaFor } = await import("../../shared/render/note-meta.mjs");
    assert.equal(await noteMetaFor(REFERENCE_NOW_MS - 5 * 60_000), "Ann · 5m ago");
  },
};
