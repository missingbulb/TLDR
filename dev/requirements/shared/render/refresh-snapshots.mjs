// Regenerates the dom snapshot images (dev/requirements/dom/cases/<name>.png) from the cases, using
// the same rendering as the snapshot test (each case through render-snapshot.mjs), then refreshes
// the two-column gallery in requirements.md. Run with `npm run refresh:ui` after an INTENTIONAL
// change to the panel, the options page, or their HTML, and commit the goldens + the gallery so a
// reviewer sees the before/after in the diff.
//
// Deterministic: an unchanged render rewrites byte-identical bytes (no timestamps), so a no-op run
// leaves a clean tree. This is a developer tool — the snapshot test itself never writes goldens (it
// is read-only in CI), so a golden only ever changes through this script + a reviewed commit.
"use strict";

import fs from "node:fs";
import { loadCases, snapshotPath } from "../cases.mjs";
import { renderSnapshot, rendersSnapshot } from "./render-snapshot.mjs";
import { buildGallery, DOC_PATH } from "../build-gallery.mjs";

const cases = (await loadCases()).filter(rendersSnapshot);
for (const testCase of cases) {
  const out = snapshotPath(testCase);
  fs.writeFileSync(out, await renderSnapshot(testCase));
  console.log(`Wrote ${out}`);
}
// buildGallery also runs each `show()` producer and inlines its one-line shown result (the real
// request→response / state-transition, as text) into the gallery cell — no separate artifact file.
fs.writeFileSync(DOC_PATH, await buildGallery());
console.log(`Refreshed the two-column gallery in ${DOC_PATH}`);
