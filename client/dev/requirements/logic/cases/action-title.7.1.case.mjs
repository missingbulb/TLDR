// 7.1 — The toolbar action's title is "Open TLDR notes" — the hover affordance that tells the user
// what clicking the icon does (it opens the side panel). Asserted against the shipped manifest.
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export default {
  description: "the toolbar action is titled \"Open TLDR notes\"",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const fs = await import("node:fs");
    const manifest = JSON.parse(fs.readFileSync(path.join(CLIENT, "manifest.json"), "utf8"));
    assert.equal(manifest.action?.default_title, "Open TLDR notes");
  },
};
