// 3.1 — The notes list is an aria-live="polite" region, so a screen reader announces a newly
// arriving note without the user having to go looking for it. Asserted against the shipped
// sidepanel.html so an accidental removal of the attribute fails loudly (a golden reviewer might
// miss it; a coded assertion can't).
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "the notes list is an aria-live=\"polite\" region",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const fs = await import("node:fs");
    const { JSDOM } = await import("jsdom");
    const html = fs.readFileSync(path.join(CLIENT, "src", "sidepanel.html"), "utf8");
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.getElementById("comments").getAttribute("aria-live"), "polite");
  },
};
