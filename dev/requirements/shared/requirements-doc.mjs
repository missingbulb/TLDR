// Parses requirements.md into its numbered requirement IDs — the single source of truth for the
// requirement list, shared by the coverage gate (requirements-coverage.test.mjs) and the gallery
// generator (build-gallery.mjs), so neither hard-codes it.
//
// A requirement is a line whose first token is a backtick-wrapped dotted number, e.g.
// "`1.3` Each note renders as a list item." The leading list dash is OPTIONAL: a requirement may
// also lead a two-column gallery table cell as bare "`1.3` …". Section headings ("## 1. Side panel")
// and in-prose cross-references ("(see `1.6`)") are not at a line's start, so they're ignored. A
// "leaf" is a requirement with no finer-grained child (1.6 is not a leaf if 1.6.1 exists); every
// leaf must have exactly one case.
//
// This file only enumerates the requirement NUMBERS. How each leaf is verified is declared by its
// CASE (its folder/kind and `tbd`), not tagged in the spec.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DOC_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "requirements.md");

// Matches a requirement at line start: optional list dash, then `<dotted-number>`.
const REQ_LINE = /^\s*(?:-\s+)?`(\d+(?:\.\d+)+)`/;

// All requirement IDs, in document order, deduped.
export function allRequirementIds(docPath = DOC_PATH) {
  const text = fs.readFileSync(docPath, "utf8");
  const ids = [];
  const seen = new Set();
  for (const line of text.split("\n")) {
    const m = REQ_LINE.exec(line);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return ids;
}

// The leaf IDs: those with no descendant (no other ID prefixed by `id + "."`).
export function leafRequirementIds(docPath = DOC_PATH) {
  const ids = allRequirementIds(docPath);
  return ids.filter((id) => !ids.some((other) => other !== id && other.startsWith(`${id}.`)));
}
