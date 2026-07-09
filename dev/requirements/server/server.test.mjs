// Runner for the `server` kind: the cross-tier rules whose real boundary is the server. Each case
// carries an executable verify() that runs the REAL handler (server/src/handler.mjs) against a faked
// API-Gateway event and asserts its response — typically an error status the handler returns before
// touching DynamoDB, so no AWS mock is needed. These sit next to the UI requirement they enforce
// (auth in §2, the size limit in §3) and prove the guarantee the UI half can only assume.
//
// Requires server/node_modules (the handler's AWS-SDK deps resolve there); CI installs them before
// this suite (.github/workflows/test-requirements.yml).
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCases, leafIdOf } from "../shared/cases.mjs";

const serverCases = (await loadCases()).filter((c) => c.kind === "server");

test("there is at least one server case", () => {
  assert.ok(serverCases.length > 0, 'no kind:"server" cases found');
});

for (const testCase of serverCases) {
  const id = leafIdOf(testCase.name);
  if (testCase.tbd) {
    test(`${id}: ${testCase.description} [untested here]`, (t) => {
      assert.ok(testCase.coveredBy, `${testCase.name}: a tbd case must name its current coverage (coveredBy)`);
      t.skip(`tracked but not wired here — covered today by ${testCase.coveredBy}`);
    });
    continue;
  }
  test(`${id}: ${testCase.description}`, async () => {
    assert.equal(typeof testCase.verify, "function", `${testCase.name}: a wired server case must export verify()`);
    await testCase.verify();
  });
}
