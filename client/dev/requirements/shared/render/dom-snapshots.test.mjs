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

const CASES = (await loadCases()).filter(rendersSnapshot);

test("there is at least one dom snapshot case", () => {
  assert.ok(CASES.length > 0, "no dom/cases/*.case.mjs found");
});

// The note meta uses the panel's toLocale* date for an older note, which follows the runtime's
// default locale AND timezone. The committed goldens are authored in en-US / UTC (the values the
// requirements npm scripts pin via LANG=C.UTF-8 and TZ=UTC — Node's CI/sandbox default too). Guard
// both so a maintainer on a non-English or non-UTC shell gets an actionable message instead of a
// baffling text diff.
test("the environment resolves to the en-US / UTC settings the goldens assume", () => {
  const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
  assert.equal(
    locale,
    "en-US",
    `dom goldens are authored in en-US, but this environment resolves to "${locale}". ` +
      `Set LANG=C.UTF-8 (the requirements npm scripts do) when running/regenerating the goldens.`
  );
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    "dom goldens are authored in UTC; set TZ=UTC (the requirements npm scripts do) when running/regenerating them."
  );
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
