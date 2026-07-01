// 10.5 — The panel's copy is per-category (issue #25): the pane TITLE, the Post button, and the
// textarea placeholder all come from the ACTIVE category's design descriptor, so e.g. TLDR mode reads
// title "TLDR" and "Post tl;dr". A non-visual wiring rule (the exact strings) → a logic leaf, asserted
// against the shipped panel + registry.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "the pane title and composer copy reflect the active category's design",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const { designFor } = await import(pathToFileURL(path.join(CLIENT, "src", "categories", "registry.mjs")).href);

    // Two different categories → two different titles + Post labels (not a hard-coded "TLDR").
    for (const cat of ["tldr", "spoiler"]) {
      const session = await open("sidepanel", { tabUrl: "https://example.com/article", local: { currentCategory: cat }, comments: [] });
      try {
        const design = designFor(cat);
        assert.equal(session.document.getElementById("title").textContent, design.title, `pane title is the ${cat} category's`);
        assert.equal(session.document.getElementById("post").textContent, design.postLabel, `Post label is the ${cat} category's`);
        assert.equal(session.document.getElementById("body").getAttribute("placeholder"), design.placeholder, `placeholder is the ${cat} category's`);
      } finally {
        session.close();
      }
    }
    // Spot-check the exact TLDR strings so a regression to a hard-coded title/label fails loudly.
    const tldr = designFor("tldr");
    assert.equal(tldr.title, "TLDR");
    assert.equal(tldr.postLabel, "Post tl;dr");
  },
};
