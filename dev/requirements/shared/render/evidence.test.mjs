// The gated runner for EVIDENCE artifacts: for every coded case that opts in (exports `evidence()`),
// render its card FROM the real run and compare pixel-exact to the committed `<name>.evidence.png` —
// the owner-approved golden embedded in the requirements gallery. This is a SECOND, orthogonal gate:
// the case's `verify()` (run by its kind's own runner) still decides whether the requirement HOLDS;
// this only decides whether the rendered VIEW of the run still matches what was approved, so a silent
// change in what the code actually produces surfaces as a diff to review — never as a fake assertion
// (the picture is never consulted to decide pass/fail of the requirement itself).
//
// Run `npm run refresh:ui` to regenerate the cards after an INTENTIONAL change; never hand-edit one to
// clear a red (README "The owner-approval contract").
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { loadCases, evidencePath } from "../cases.mjs";
import { produceEvidence, hasEvidence } from "./evidence-renderer.mjs";
import { artifactPath } from "../artifacts-dir.mjs";
import { assertEnUsUtc } from "../locale-guard.mjs";

const MAX_DIFF_RATIO = 0; // deterministic (satori + resvg + bundled font): an exact match or a real change.
const CASES = (await loadCases()).filter(hasEvidence);

// Evidence cards can render an older note's absolute date / a real handler run; keep the same
// en-US/UTC pin the other rendered lanes assume.
test("the evidence environment resolves to en-US / UTC", () => {
  assertEnUsUtc(assert);
});

async function compareEvidence(testCase, pngBuffer) {
  const snapPath = evidencePath(testCase);
  assert.ok(fs.existsSync(snapPath), `No evidence image at ${snapPath}; run "npm run refresh:ui" to create one.`);
  const actual = PNG.sync.read(pngBuffer);
  const expected = PNG.sync.read(fs.readFileSync(snapPath));
  if (actual.width !== expected.width || actual.height !== expected.height) {
    const actualPath = artifactPath(`${testCase.name}.evidence.actual.png`);
    fs.writeFileSync(actualPath, pngBuffer);
    assert.fail(`${testCase.name}: evidence size changed: expected ${expected.width}x${expected.height}, got ${actual.width}x${actual.height}. Run "npm run refresh:ui" if intentional. Actual at ${actualPath}.`);
  }
  const { width, height } = actual;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(actual.data, expected.data, diff.data, width, height, { threshold: 0.1 });
  if (diffPixels / (width * height) > MAX_DIFF_RATIO) {
    const actualPath = artifactPath(`${testCase.name}.evidence.actual.png`);
    const diffPath = artifactPath(`${testCase.name}.evidence.diff.png`);
    fs.writeFileSync(actualPath, pngBuffer);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    assert.fail(`${testCase.name}: the evidence card changed — ${diffPixels} of ${width * height} pixels differ. The committed card is the owner-approved expected; if intentional, run "npm run refresh:ui", review the diff, and get it approved. See ${actualPath} and ${diffPath}.`);
  }
}

for (const testCase of CASES) {
  test(`evidence "${testCase.name}" (${testCase.description}) matches its committed card`, async () => {
    await compareEvidence(testCase, await produceEvidence(testCase));
  });
}
