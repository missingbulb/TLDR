// The registry of requirement KINDS — the single extension point of the executable-requirements
// framework. A "kind" is one way a requirement leaf can be asserted: a rendered-state snapshot
// (`dom`), a user gesture a static snapshot can't show (`behavior`), or a pure product/format rule
// (`logic`). Kinds are AUTO-DISCOVERED: every dev/requirements/<kind>/ directory that contains a
// `kind.mjs` descriptor is a kind, named for its folder.
//
// The folder IS the classifier — a case's kind is the directory it lives in, never a field inside
// the case (one source of truth, no parallel classifier to drift).
//
// Adding a kind is therefore self-contained and obvious:
//   1. mkdir dev/requirements/<kind>/cases
//   2. add dev/requirements/<kind>/kind.mjs    (this descriptor — `snapshot` = has a committed expected file)
//   3. add dev/requirements/<kind>/<kind>.test.mjs   (the runner that produces actual + compares to expected)
//   4. add the requirement leaf(s) to requirements.md and a case under <kind>/cases/
// Nothing here, in the loader, or in the coverage gate needs editing — they all iterate this
// registry. See README.md for the full methodology.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIREMENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every <kind>/ folder carrying a kind.mjs descriptor, in stable name order.
async function loadKinds() {
  const dirs = fs
    .readdirSync(REQUIREMENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(REQUIREMENTS_DIR, d.name, "kind.mjs")))
    .map((d) => d.name)
    .sort();

  const kinds = [];
  for (const name of dirs) {
    const mod = await import(pathToFileURL(path.join(REQUIREMENTS_DIR, name, "kind.mjs")).href);
    const descriptor = mod.default ?? mod;
    kinds.push({
      name: descriptor.name || name,
      // snapshot = the kind's owner-approved EXPECTED is a committed artifact file beside the case
      // (a serialized-DOM golden for `dom`). A non-snapshot kind's expected is a coded assertion and
      // its case must carry no committed expected file (enforced by the coverage gate).
      snapshot: Boolean(descriptor.snapshot),
      dir: path.join(REQUIREMENTS_DIR, name),
      casesDir: path.join(REQUIREMENTS_DIR, name, "cases"),
    });
  }
  return kinds;
}

export const KINDS = await loadKinds();
export const KIND_NAMES = KINDS.map((k) => k.name);
export const SNAPSHOT_KINDS = KINDS.filter((k) => k.snapshot).map((k) => k.name);
export const kindByName = (name) => KINDS.find((k) => k.name === name) || null;
