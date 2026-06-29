// The requirement CASES, loaded across every kind. A case is a per-leaf module
// `<slug>.<leaf-id>.case.mjs` under `<kind>/cases/`, where <slug> is the requirement section's
// component/feature name (e.g. `notes-list`) and <leaf-id> is the dotted requirement number it pins
// (e.g. `1.3`). The FILENAME names the single requirements.md leaf it pins (the coverage gate reads
// the trailing leaf id via `leafIdOf`); the case's KIND is the folder it lives in (see kinds.mjs —
// the folder is the single classifier, so a case module carries NO `kind` field).
//
// A case is deliberately CHEAP TO LOAD: it exports plain metadata (a description, the fake inputs
// for a `dom` case, or a `verify()` for a coded case) and does its heavy lifting — importing the
// jsdom harness or a shipped module — LAZILY inside verify()/action, never at module top level. So
// loading every case (the coverage gate, the gallery generator) pulls in no jsdom.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { KINDS } from "./kinds.mjs";

// The leaf requirement id (`1.3`) a case name (`notes-list.1.3`) or image stem pins: the trailing
// dotted-number run. Returns null if the name carries no dotted id (a malformed/misnamed case — the
// coverage gate flags it).
export function leafIdOf(name) {
  const m = /(\d+(?:\.\d+)+)$/.exec(name);
  return m ? m[1] : null;
}

// All cases across all kinds, in stable (name) order. Each entry is { ...caseModule, name, kind,
// dir, snapshot } — kind/dir/snapshot come from the case's folder (kinds.mjs) and are authoritative
// over anything the module might set. `dir` is the kind's cases/ directory, where a snapshot kind's
// committed image lives.
export async function loadCases() {
  const cases = [];
  for (const kind of KINDS) {
    if (!fs.existsSync(kind.casesDir)) continue;
    for (const f of fs.readdirSync(kind.casesDir).filter((n) => n.endsWith(".case.mjs")).sort()) {
      const name = f.replace(/\.case\.mjs$/, "");
      const mod = await import(pathToFileURL(path.join(kind.casesDir, f)).href);
      const def = mod.default ?? mod;
      cases.push({ ...def, name, kind: kind.name, dir: kind.casesDir, snapshot: kind.snapshot });
    }
  }
  return cases.sort((a, b) => a.name.localeCompare(b.name));
}

// Absolute path to a case's committed snapshot artifact — the owner-approved PNG embedded in the
// requirements gallery (snapshot kinds only).
export function snapshotPath(testCase) {
  return path.join(testCase.dir, `${testCase.name}.png`);
}
