// The dom snapshot runner: for every `dom` case, render the side panel / options page through the
// REAL module and compare the serialized DOM to the committed golden (dom/cases/<name>.golden.txt).
// So the goldens track the shipped code directly — there is no hand-maintained copy of the markup.
//
// Run `npm run refresh:ui` to regenerate the goldens after an INTENTIONAL change to the panel, the
// options page, or their HTML. NEVER hand-edit a golden to make a red test green: a golden is the
// owner-approved expected — on a legitimate change, regenerate, eyeball the diff, and get it
// approved (see README "The owner-approval contract"). On a mismatch this writes the freshly-rendered
// actual to .artifacts/ and points at it so the diff is reviewable.
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadCases, goldenPath } from "../cases.mjs";
import { renderSnapshot, rendersSnapshot } from "./render-snapshot.mjs";
import { artifactPath } from "../artifacts-dir.mjs";
import { assertEnUsUtc } from "../locale-guard.mjs";
import { SNAPSHOT_KINDS } from "../kinds.mjs";

const allCases = await loadCases();
const CASES = allCases.filter(rendersSnapshot);

test("there is at least one dom snapshot case", () => {
  assert.ok(CASES.length > 0, "no dom/cases/*.case.mjs found");
});

// Every snapshot kind must have a producer here — else its cases would be silently filtered out by
// rendersSnapshot and never compared. Guards against adding a snapshot kind folder without wiring its
// producer into render-snapshot.mjs (which would otherwise pass vacuously).
test("every snapshot kind is produced by this runner", () => {
  const orphan = SNAPSHOT_KINDS.filter((k) => !rendersSnapshot({ kind: k }));
  assert.deepEqual(orphan, [], "snapshot kinds with no producer in render-snapshot.mjs:");
});

// The note meta renders an older note's absolute date via the panel's toLocale* call (locale- and
// timezone-dependent). The goldens are authored in en-US / UTC; guard it (shared with the logic
// runner, which has the same dependency in case 4.4).
test("the environment resolves to the en-US / UTC settings the goldens assume", () => {
  assertEnUsUtc(assert);
});

for (const testCase of CASES) {
  test(`dom case "${testCase.name}" (${testCase.description}) matches its golden`, async () => {
    const actual = await renderSnapshot(testCase);
    const gpath = goldenPath(testCase);
    assert.ok(fs.existsSync(gpath), `No golden at ${gpath}; run "npm run refresh:ui" to create one.`);
    const expected = fs.readFileSync(gpath, "utf8");
    if (actual !== expected) {
      const actualPath = artifactPath(`${testCase.name}.actual.txt`);
      fs.writeFileSync(actualPath, actual);
      assert.fail(
        `${testCase.name}: the rendered panel changed. The committed golden is the owner-approved ` +
          `expected — if this change is intentional, run "npm run refresh:ui", review the diff, and ` +
          `get it approved. Rendered actual written to ${actualPath}.`
      );
    }
  });
}
