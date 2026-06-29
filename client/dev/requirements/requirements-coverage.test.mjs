// The traceability spine between requirements.md and the cases that verify it. The spec enumerates
// the requirement NUMBERS; each CASE declares, by the folder it lives in, HOW its leaf is verified
// (its kind), and the FILENAME declares WHICH leaf. This gate is the strict bijection between them,
// plus the routing rules each kind implies:
//
//   - EVERY leaf has exactly one `<slug>.<id>.case.mjs` (the FILENAME is the link), and every case
//     names a real leaf. No leaf is unclaimed; no case is a stray.
//   - A case's kind (its folder) decides verification: a `dom` case is pinned by a committed golden;
//     a `behavior`/`logic` case is verified by coded assertions in its runner — and must carry NO
//     golden (a snapshot can't verify a click or a pure rule any more than a click test can pin
//     pixels — the #429 segment-by-verification lesson in testingPractices.md).
//
// A new leaf with no case fails here; a stray/misnamed case fails; a coded case that smuggled in a
// golden fails.
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadCases, leafIdOf, goldenPath } from "./shared/cases.mjs";
import { allRequirementIds, leafRequirementIds } from "./shared/requirements-doc.mjs";
import { KIND_NAMES, SNAPSHOT_KINDS } from "./shared/kinds.mjs";

const allIds = new Set(allRequirementIds());
const leaves = leafRequirementIds();
const cases = await loadCases();

// A case file is `<slug>.<leaf-id>.case.mjs`: a kebab-case component/feature slug, then the dotted
// requirement number it pins.
const PER_LEAF = /^[a-z][a-z0-9-]*\.(\d+(?:\.\d+)+)$/;
const idOf = (c) => leafIdOf(c.name);
// Kinds are auto-discovered from the <kind>/kind.mjs descriptors, so this gate hardcodes no list.
const KNOWN_KINDS = new Set(KIND_NAMES);
const SNAPSHOT = new Set(SNAPSHOT_KINDS);

test("requirements.md yields leaf requirements", () => {
  assert.ok(allIds.size > 0, "no `N.M` requirement IDs parsed from requirements.md");
  assert.ok(leaves.length > 0, "no leaf requirements computed");
});

test("every case is a `<slug>.<id>` case naming a real leaf", () => {
  const bad = [];
  for (const c of cases) {
    const m = PER_LEAF.exec(c.name);
    if (!m) bad.push(`${c.name} (not named <slug>.<id>.case.mjs)`);
    else if (!allIds.has(m[1])) bad.push(`${c.name} (${m[1]} is not a requirement in the spec)`);
  }
  assert.deepEqual(bad, [], "stray/misnamed cases:");
});

test("every leaf has exactly one case (strict bijection)", () => {
  const counts = cases.reduce((acc, c) => ((acc[idOf(c)] = (acc[idOf(c)] || 0) + 1), acc), {});
  const missing = leaves.filter((id) => !counts[id]);
  const dupes = Object.keys(counts).filter((id) => counts[id] > 1);
  assert.deepEqual(missing, [], "leaves with no <slug>.<id>.case.mjs:");
  assert.deepEqual(dupes, [], "leaves with more than one case:");
});

test("every case declares a known kind (its folder)", () => {
  const bad = cases.filter((c) => !KNOWN_KINDS.has(c.kind)).map((c) => `${c.name} (kind="${c.kind}")`);
  assert.deepEqual(bad, [], `cases with an unknown kind (known: ${[...KNOWN_KINDS].join(", ")}):`);
});

test("a coded (non-snapshot) case carries no golden — a golden can't verify a click or a rule (#429)", () => {
  const bad = cases
    .filter((c) => !SNAPSHOT.has(c.kind) && fs.existsSync(goldenPath(c)))
    .map((c) => `${c.name}.golden.txt`);
  assert.deepEqual(bad, [], "behavior/logic leaves must not carry a golden:");
});

test("a coded case must export a verify() (or be an explicit tbd with a coveredBy pointer)", () => {
  const bad = cases
    .filter((c) => !SNAPSHOT.has(c.kind))
    .filter((c) => !(typeof c.verify === "function" || (c.tbd && c.coveredBy)))
    .map((c) => c.name);
  assert.deepEqual(bad, [], "coded cases missing verify() (and not a tbd+coveredBy):");
});
