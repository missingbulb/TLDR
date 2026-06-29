// 4.4 — A note a day or more old reads the absolute locale date (it stops being "hours ago"). The
// requirements lane runs with TZ=UTC and an en-US locale (set in package.json's test scripts) so the
// formatted date is deterministic; the dom-snapshot runner guards both.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  description: "a note a day or more old reads the absolute locale date",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { noteMetaFor } = await import("../../shared/render/note-meta.mjs");
    // Reference instant is 2026-06-28T12:00:00Z; two days earlier is 2026-06-26 (en-US: 6/26/2026).
    assert.equal(await noteMetaFor(REFERENCE_NOW_MS - 2 * 86_400_000), "Ann · 6/26/2026");
  },
};
