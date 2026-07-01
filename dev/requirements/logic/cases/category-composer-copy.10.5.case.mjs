// 10.5 — The composer copy is per-category (issue #25): the Post button and the textarea placeholder
// come from the ACTIVE category's design descriptor, so e.g. TLDR mode reads "Post tl;dr". A non-visual
// wiring rule (the exact strings) → a logic leaf, asserted against the shipped panel + registry.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "the composer's Post label and placeholder are the active category's design copy",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const { designFor } = await import(pathToFileURL(path.join(CLIENT, "src", "categories", "registry.mjs")).href);

    const session = await open("sidepanel", { tabUrl: "https://example.com/article", local: { currentCategory: "tldr" }, comments: [] });
    try {
      const design = designFor("tldr");
      assert.equal(session.document.getElementById("post").textContent, design.postLabel, "Post label is the category's copy");
      assert.equal(session.document.getElementById("body").getAttribute("placeholder"), design.placeholder, "placeholder is the category's copy");
      assert.equal(session.document.getElementById("post").textContent, "Post tl;dr", "TLDR mode relabels Post to 'Post tl;dr'");
    } finally {
      session.close();
    }
  },
};
