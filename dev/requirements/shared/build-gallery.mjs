// Maintains the two-column gallery embedded in requirements.md: each leaf requirement is laid out
// as a small HTML <table> row — LEFT cell a generated pointer to the leaf's artifact/runner, RIGHT
// cell the hand-authored requirement prose. GitHub renders the markdown inside a <td> as long as
// it's surrounded by blank lines, so both columns render.
//
// SPLIT OF OWNERSHIP — why this stays drift-free:
//   - The <table> scaffolding and the RIGHT-cell requirement prose are hand-authored (the spec).
//     This generator never rewrites them.
//   - The LEFT-cell content is a single MANAGED line, tagged with an ID-bearing marker
//     `<!-- req-gallery:<id> -->`. This generator rewrites ONLY those marker lines, keyed off the
//     leaf's kind. The marker is the LAST token on the line so the line starts as real markdown.
//
// So a re-run only ever changes a left-cell pointer line; the gate (gallery.test.mjs) checks that
// (a) the committed file equals this generator's output and (b) every leaf — and only a leaf —
// carries exactly one marker. Deterministic, no timestamps.
"use strict";

import fs from "node:fs";
import { DOC_PATH } from "./requirements-doc.mjs";
import { loadCases, leafIdOf } from "./cases.mjs";

// Test runners, addressed relative to requirements.md (its sibling kind folders).
const BEHAVIOR_TEST = "behavior/behavior.test.mjs";
const LOGIC_TEST = "logic/logic.test.mjs";
const SERVER_TEST = "server/server.test.mjs";

const MARKER_RE = /<!--\s*req-gallery:(\d+(?:\.\d+)+)\s*-->/;
const marker = (id) => `<!-- req-gallery:${id} -->`;

// The canonical managed left-cell content for one leaf, derived from its CASE (its kind / tbd):
//   - dom/component → the committed PNG (whole panel / a cropped element), embedded inline for approval.
//   - behavior      → a note pointing at the behavior runner (a gesture a static snapshot can't show).
//   - server        → a note pointing at the server runner (a server-enforced response, no UI).
//   - logic         → a note pointing at the logic runner, or, for a tbd leaf, where it's covered today.
function managedLine(id, testCase) {
  const kind = testCase?.kind || "logic";
  // Any snapshot kind embeds its committed PNG from its own <kind>/cases/ folder.
  if (testCase?.snapshot) {
    const stem = testCase?.name || id;
    return `![${stem}](${kind}/cases/${stem}.png) ${marker(id)}`;
  }
  if (kind === "behavior") {
    if (testCase?.tbd) {
      return `⚠️ _Behavior leaf — **untested here** — covered today by \`${testCase?.coveredBy || "?"}\`._ ${marker(id)}`;
    }
    return `🚩 _Behavior leaf — verified by \`${BEHAVIOR_TEST}\` (a gesture a static snapshot can't show)._ ${marker(id)}`;
  }
  if (kind === "server") {
    return `🛡️ _Server leaf — verified by \`${SERVER_TEST}\` (the real handler's response, asserted server-side)._ ${marker(id)}`;
  }
  const note = testCase?.tbd
    ? `**untested here** — covered today by \`${testCase?.coveredBy || "?"}\``
    : `verified by \`${LOGIC_TEST}\``;
  return `🔧 _Logic leaf — ${note}._ ${marker(id)}`;
}

// All leaf IDs that carry a marker line in the doc, with their line indices.
export function markerLines(lines) {
  const out = [];
  lines.forEach((line, i) => {
    const m = MARKER_RE.exec(line);
    if (m) out.push({ id: m[1], i });
  });
  return out;
}

// Rewrite every managed marker line to its canonical content (preserving leading indentation);
// leave every other line — scaffolding and prose — untouched.
export async function buildGallery(docPath = DOC_PATH) {
  const caseById = new Map((await loadCases()).map((c) => [leafIdOf(c.name), c]));
  const lines = fs.readFileSync(docPath, "utf8").split("\n");
  const out = lines.map((line) => {
    const m = MARKER_RE.exec(line);
    if (!m) return line;
    const lead = line.match(/^\s*/)[0];
    return `${lead}${managedLine(m[1], caseById.get(m[1]))}`;
  });
  return out.join("\n");
}

export { MARKER_RE, DOC_PATH };
