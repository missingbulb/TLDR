// The traceability spine between requirements.md and the cases that verify it. The spec enumerates
// the requirement NUMBERS; each CASE declares, by the folder it lives in, HOW its leaf is verified
// (its kind), and the FILENAME declares WHICH leaf. This gate is the strict bijection between them,
// plus the routing rules each kind implies:
//
//   - EVERY leaf has exactly one `<slug>.<id>.case.mjs` (the FILENAME is the link), and every case
//     names a real leaf. No leaf is unclaimed; no case is a stray.
//   - A case's kind (its folder) decides verification: a `dom` case is pinned by a committed image;
//     a `behavior`/`logic` case is verified by coded assertions in its runner — and must carry NO
//     image (a snapshot can't verify a click or a pure rule any more than a click test can pin
//     pixels — the #429 segment-by-verification lesson in testingPractices.md).
//
// A new leaf with no case fails here; a stray/misnamed case fails; a coded case that smuggled in a
// snapshot image fails.
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases, leafIdOf, snapshotPath } from "./shared/cases.mjs";
import { allRequirementIds, leafRequirementIds } from "./shared/requirements-doc.mjs";
import { KINDS, KIND_NAMES, SNAPSHOT_KINDS } from "./shared/kinds.mjs";

const REQ_DIR = path.dirname(fileURLToPath(import.meta.url));
// All snapshot kinds share one runner; each coded kind has its own `<kind>/<kind>.test.mjs`.
const SNAPSHOT_RUNNER = path.join(REQ_DIR, "shared", "render", "dom-snapshots.test.mjs");

// The leaves deliberately NOT verified here — a tbd case tracks each, naming where it's covered
// today. This is a committed allowlist so that downgrading a wired leaf to `tbd` (which would stop
// its verify() from ever running) is a reviewed change, not a silent hole.
const TBD_LEAVES = ["8.1", "11.14"];

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

// Kinds are auto-discovered from <kind>/kind.mjs, but a case is only actually VERIFIED if a runner
// executes it. Close the loop: every discovered kind must have a runner — the shared snapshot runner
// for a snapshot kind, or `<kind>/<kind>.test.mjs` for a coded kind. Without this, a new kind folder
// (with cases) whose runner was forgotten would leave its leaves "claimed" but never run, suite green.
test("every kind has a runner that executes its cases", () => {
  const missing = [];
  for (const kind of KINDS) {
    if (SNAPSHOT.has(kind.name)) {
      if (!fs.existsSync(SNAPSHOT_RUNNER)) missing.push(`${kind.name} (shared snapshot runner missing)`);
    } else {
      const runner = path.join(kind.dir, `${kind.name}.test.mjs`);
      if (!fs.existsSync(runner)) missing.push(`${kind.name} (no ${kind.name}/${kind.name}.test.mjs)`);
    }
  }
  assert.deepEqual(missing, [], "kinds with no runner — their cases would be claimed but never executed:");
});

test("a coded (non-snapshot) case carries no snapshot image — an image can't verify a click or a rule (#429)", () => {
  const bad = cases
    .filter((c) => !SNAPSHOT.has(c.kind) && fs.existsSync(snapshotPath(c)))
    .map((c) => `${c.name}.png`);
  assert.deepEqual(bad, [], "behavior/logic leaves must not carry a snapshot image:");
});

test("a coded case must export a verify() (or be an explicit tbd with a coveredBy pointer)", () => {
  const bad = cases
    .filter((c) => !SNAPSHOT.has(c.kind))
    .filter((c) => !(typeof c.verify === "function" || (c.tbd && c.coveredBy)))
    .map((c) => c.name);
  assert.deepEqual(bad, [], "coded cases missing verify() (and not a tbd+coveredBy):");
});

// `tbd` skips a leaf's verification (the runners report it skipped before calling verify()), so it's
// an escape hatch. Pin it: the set of tbd leaves must equal a committed allowlist, so downgrading a
// real, wired leaf to tbd — hiding its verification — fails here as a reviewed change, not silently.
test("the set of tbd leaves equals the committed allowlist (a tbd downgrade is a reviewed change)", () => {
  const tbd = cases.filter((c) => c.tbd).map((c) => leafIdOf(c.name)).sort();
  assert.deepEqual(
    tbd,
    [...TBD_LEAVES].sort(),
    "tbd leaves drifted from the allowlist — a wired leaf marked tbd hides its verification; update TBD_LEAVES only deliberately."
  );
});

// A leaf can't both carry real coded coverage and claim it's not verified here — that combination is
// how a sabotaged verify() would hide behind tbd (the runner skips tbd before calling verify()).
test("a tbd case carries no verify()", () => {
  const bad = cases.filter((c) => c.tbd && typeof c.verify === "function").map((c) => c.name);
  assert.deepEqual(bad, [], "tbd cases that also export verify() (drop one):");
});
