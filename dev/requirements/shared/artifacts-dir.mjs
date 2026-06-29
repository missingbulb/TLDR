// Where the dom snapshot tests write their <name>.actual.txt debugging artifact when a comparison
// fails. A single dir separate from the committed reference goldens in dev/requirements/dom/cases/,
// ignored by one .gitignore line, so adding cases never adds per-file ignore entries. Keeping it
// in-repo (rather than the system temp dir) lets CI collect the actuals as build artifacts on
// failure. Failure messages print the full path.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ARTIFACTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".artifacts");

// Absolute path for a named artifact, creating the dir on first use.
export function artifactPath(name) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  return path.join(ARTIFACTS_DIR, name);
}
