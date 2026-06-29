// Runner for the `logic` kind: the non-visual product/format rules and static UI-surface
// declarations. Each is a `logic` case carrying an executable verify() that asserts the rule against
// the real shipped code/markup (a wired case), or a tbd case naming where it's covered today
// (reported skipped, so the requirement stays visible and unverified-here rather than silently
// absent). This file runs the wired ones and surfaces the tbd ones.
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCases, leafIdOf } from "../shared/cases.mjs";

const logicCases = (await loadCases()).filter((c) => c.kind === "logic");

test("there is at least one logic case", () => {
  assert.ok(logicCases.length > 0, 'no kind:"logic" cases found');
});

for (const testCase of logicCases) {
  const id = leafIdOf(testCase.name);
  if (testCase.tbd) {
    test(`${id}: ${testCase.description} [untested here]`, (t) => {
      assert.ok(testCase.coveredBy, `${testCase.name}: a tbd logic case must name its current coverage (coveredBy)`);
      t.skip(`tracked but not wired here — covered today by ${testCase.coveredBy}`);
    });
    continue;
  }
  test(`${id}: ${testCase.description}`, async () => {
    assert.equal(typeof testCase.verify, "function", `${testCase.name}: a wired logic case must export verify()`);
    await testCase.verify();
  });
}
