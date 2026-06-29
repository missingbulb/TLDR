// Runner for the `behavior` kind: the gestures a static snapshot structurally can't verify — typing
// a note and posting it (optimistic insert, success-reconcile, failure), an empty-body no-op, an
// HTML-looking body that must not inject an element, and saving the denylist. Each is a
// `behavior` case carrying an executable verify() that drives the real UI through the harness and
// asserts the DOM + captured browser/network calls; this file iterates every behavior case and runs
// it (a tbd case is reported skipped).
//
// The structural guarantees that this runner runs every behavior leaf — and only real leaves —
// live in the central gate (requirements-coverage.test.mjs): the leaf⇄case bijection, the
// "every kind has a runner" check (so a behavior leaf can't be claimed with no runner), and the
// tbd allowlist (so a wired leaf can't be silently downgraded to skipped).
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCases, leafIdOf } from "../shared/cases.mjs";

const behaviorCases = (await loadCases()).filter((c) => c.kind === "behavior");

test("there is at least one behavior case", () => {
  assert.ok(behaviorCases.length > 0, 'no kind:"behavior" cases found');
});

for (const testCase of behaviorCases) {
  const id = leafIdOf(testCase.name);
  if (testCase.tbd) {
    test(`${id}: ${testCase.description} [untested here]`, (t) => {
      assert.ok(testCase.coveredBy, `${testCase.name}: a tbd case must name its current coverage (coveredBy)`);
      t.skip(`tracked but not wired here — covered today by ${testCase.coveredBy}`);
    });
    continue;
  }
  test(`${id}: ${testCase.description}`, async () => {
    assert.equal(typeof testCase.verify, "function", `${testCase.name}: a wired behavior case must export verify()`);
    await testCase.verify();
  });
}
