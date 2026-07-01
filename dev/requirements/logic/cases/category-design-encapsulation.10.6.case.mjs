// 10.6 — Each category's design is ENCAPSULATED so restyling one has ZERO effect on the others, and
// is STRICTLY design, not behavior (owner constraint, issue #25). Proven structurally against the
// shipped files: every seed category has a stylesheet whose rules are all scoped to its OWN
// body[data-category="<id>"] and contain ONLY design tokens (custom properties) — no selector reaching
// outside its scope, no non-token declarations — and the categories define DISTINCT separator colours
// (so they visibly differ and a change to one can't bleed into another). Plus each carries composer copy.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "each category's design is encapsulated (own-scoped, tokens-only) and the categories look distinct",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { CATEGORIES } = await import(pathToFileURL(path.join(CLIENT, "vendor", "categories.GENERATED.mjs")).href);
    const { designFor } = await import(pathToFileURL(path.join(CLIENT, "src", "categories", "registry.mjs")).href);

    const separators = new Set();
    const accents = new Set();
    for (const { id } of CATEGORIES) {
      const cssPath = path.join(CLIENT, "src", "categories", id, `${id}.css`);
      assert.ok(fs.existsSync(cssPath), `category "${id}" has a scoped stylesheet ${id}.css`);
      const css = fs.readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""); // drop comments

      let scopedRules = 0;
      let m;
      const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
      while ((m = ruleRe.exec(css))) {
        const selector = m[1].trim();
        assert.ok(
          selector.includes(`[data-category="${id}"]`),
          `${id}.css must scope every rule to its own category (offending selector: "${selector}")`,
        );
        scopedRules += 1;
        for (const decl of m[2].split(";")) {
          const prop = decl.split(":")[0].trim();
          if (!prop) continue;
          assert.ok(prop.startsWith("--"), `${id}.css must declare only design tokens (found non-token "${prop}")`);
        }
        const sep = /--separator\s*:\s*([^;]+)/.exec(m[2]);
        if (sep) separators.add(sep[1].trim());
        const accent = /--accent\s*:\s*([^;]+)/.exec(m[2]);
        if (accent) accents.add(accent[1].trim());
      }
      assert.ok(scopedRules > 0, `${id}.css has at least one scoped rule`);

      const design = designFor(id);
      assert.ok(design.title && design.postLabel && design.placeholder, `category "${id}" carries its title + composer copy`);
    }
    // Separators + accents both differ across categories — the "separators + accent + copy" design scope.
    assert.equal(separators.size, CATEGORIES.length, "each category defines a DISTINCT separator colour");
    assert.equal(accents.size, CATEGORIES.length, "each category defines a DISTINCT accent colour");
  },
};
