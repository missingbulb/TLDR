// The dom snapshot runner: for every `dom` case, render the side panel / options page through the
// REAL module + the real sidepanel.css (satori -> resvg) and compare the PNG pixel-by-pixel to the
// committed reference image (dom/cases/<name>.png) — the same image embedded in requirements.md for
// owner approval. So the images track the shipped code directly; there is no hand-maintained copy of
// the markup or the styles.
//
// Run `npm run refresh:ui` to regenerate the images after an INTENTIONAL change to the panel, the
// options page, or sidepanel.css. NEVER hand-replace an image to make a red test green: it is the
// owner-approved expected — on a legitimate change, regenerate, eyeball the visual diff, and get it
// approved (README "The owner-approval contract"). On a mismatch this writes the freshly-rendered
// actual + a diff to .artifacts/ so the change is reviewable.
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { loadCases, snapshotPath } from "../cases.mjs";
import { renderSnapshot, rendersSnapshot } from "./render-snapshot.mjs";
import { artifactPath } from "../artifacts-dir.mjs";
import { assertEnUsUtc } from "../locale-guard.mjs";
import { SNAPSHOT_KINDS } from "../kinds.mjs";

// Rendering is deterministic (satori + resvg + the bundled font, no browser), so a snapshot must
// match its reference EXACTLY. If cross-platform rasterization noise ever makes this flap, revisit a
// small tolerance then rather than pre-emptively.
const MAX_DIFF_RATIO = 0;

const CASES = (await loadCases()).filter(rendersSnapshot);

test("there is at least one dom snapshot case", () => {
  assert.ok(CASES.length > 0, "no dom/cases/*.case.mjs found");
});

// Every snapshot kind must have a producer — else its cases would be silently filtered out by
// rendersSnapshot and never compared (a vacuous pass). Guards against adding a snapshot kind folder
// without wiring its producer into render-snapshot.mjs.
test("every snapshot kind is produced by this runner", () => {
  const orphan = SNAPSHOT_KINDS.filter((k) => !rendersSnapshot({ kind: k }));
  assert.deepEqual(orphan, [], "snapshot kinds with no producer in render-snapshot.mjs:");
});

// The panel renders an older note's absolute date via toLocale* (locale- and timezone-dependent).
// The images are authored in en-US / UTC; guard it (shared with the logic runner, case 4.4).
test("the environment resolves to the en-US / UTC settings the images assume", () => {
  assertEnUsUtc(assert);
});

async function compareToSnapshot(testCase, pngBuffer) {
  const snapPath = snapshotPath(testCase);
  assert.ok(fs.existsSync(snapPath), `No image at ${snapPath}; run "npm run refresh:ui" to create one.`);

  const actual = PNG.sync.read(pngBuffer);
  const expected = PNG.sync.read(fs.readFileSync(snapPath));

  if (actual.width !== expected.width || actual.height !== expected.height) {
    const actualPath = artifactPath(`${testCase.name}.actual.png`);
    fs.writeFileSync(actualPath, pngBuffer);
    assert.fail(
      `${testCase.name}: render size changed: expected ${expected.width}x${expected.height}, got ` +
        `${actual.width}x${actual.height}. Run "npm run refresh:ui" if this is intentional. Actual at ${actualPath}.`
    );
  }

  const { width, height } = actual;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(actual.data, expected.data, diff.data, width, height, { threshold: 0.1 });
  const ratio = diffPixels / (width * height);
  if (ratio > MAX_DIFF_RATIO) {
    const actualPath = artifactPath(`${testCase.name}.actual.png`);
    const diffPath = artifactPath(`${testCase.name}.diff.png`);
    fs.writeFileSync(actualPath, pngBuffer);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    assert.fail(
      `${testCase.name}: the rendered panel changed — ${diffPixels} of ${width * height} pixels differ ` +
        `(${(ratio * 100).toFixed(2)}%). The committed image is the owner-approved expected; if this is ` +
        `intentional, run "npm run refresh:ui", review the diff, and get it approved. See ${actualPath} and ${diffPath}.`
    );
  }
}

for (const testCase of CASES) {
  test(`dom case "${testCase.name}" (${testCase.description}) matches its image`, async () => {
    await compareToSnapshot(testCase, await renderSnapshot(testCase));
  });
}
