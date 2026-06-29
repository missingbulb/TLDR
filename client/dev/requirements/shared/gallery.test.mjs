// Keeps the two-column gallery (the generated left-cell pointer lines, tagged
// `<!-- req-gallery:<id> -->`, in requirements.md) in sync with the cases, the same REFRESH-then-GATE
// way as the goldens: a refresh test rewrites the managed lines into the working tree (skipped in
// CI), and a gate test asserts the committed file already matches (the read-only truth in CI). So
// flipping a leaf's kind, or adding a case, updates the left cells on the next local
// `npm run refresh:ui`, and a stale doc fails CI.
//
// A second gate checks STRUCTURE the generator can't fix on its own (it only rewrites existing
// marker lines, never inserts): every leaf — and only a leaf — carries exactly one marker, so a leaf
// whose two-column row was dropped, or a marker for a non-leaf, fails here.
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildGallery, markerLines, DOC_PATH } from "./build-gallery.mjs";
import { leafRequirementIds } from "./requirements-doc.mjs";

const isCI = Boolean(process.env.CI);

test("two-column gallery is refreshed (skipped in CI)", async (t) => {
  if (isCI) {
    t.skip("CI: read-only gate — the committed requirements.md is the reviewed truth");
    return;
  }
  fs.writeFileSync(DOC_PATH, await buildGallery());
});

test("requirements.md gallery matches the generator (run npm run refresh:ui)", async () => {
  const committed = fs.existsSync(DOC_PATH) ? fs.readFileSync(DOC_PATH, "utf8") : "";
  assert.equal(
    committed,
    await buildGallery(),
    "requirements.md's generated left-cell lines are stale. Run `npm run refresh:ui` and commit the result."
  );
});

test("every leaf — and only a leaf — has exactly one gallery marker", () => {
  const leaves = leafRequirementIds();
  const leafSet = new Set(leaves);
  const marks = markerLines(fs.readFileSync(DOC_PATH, "utf8").split("\n"));

  const counts = marks.reduce((acc, { id }) => ((acc[id] = (acc[id] || 0) + 1), acc), {});
  const missing = leaves.filter((id) => !counts[id]);
  const dupes = Object.keys(counts).filter((id) => counts[id] > 1);
  const stray = Object.keys(counts).filter((id) => !leafSet.has(id));

  assert.deepEqual(missing, [], "leaves with no `<!-- req-gallery:id -->` row in requirements.md:");
  assert.deepEqual(dupes, [], "leaves with more than one gallery row:");
  assert.deepEqual(stray, [], "gallery markers for IDs that aren't leaf requirements:");
});
