// 7.2 — The denylist editor is registered as the extension's options UI (manifest options_ui →
// src/options.html), so it is reachable from the extensions page / the action's context menu.
// Asserted against the shipped manifest.
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "extension");

export default {
  description: "the options page (denylist editor) is registered as the extension's options UI",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const fs = await import("node:fs");
    const manifest = JSON.parse(fs.readFileSync(path.join(CLIENT, "manifest.json"), "utf8"));
    assert.equal(manifest.options_ui?.page, "src/options.html");
  },
};
