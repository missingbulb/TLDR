// 11.6 — A hovered link whose host is on the reader's per-site denylist is never a link-hover lookup
// candidate — the SAME evaluatePage gate (and so the SAME synced denylist) the side panel applies to
// the active tab (§4.2), reused verbatim via client/src/link-hover-gate.mjs's candidatePageId — never a
// separate policy that could drift from it. The gallery show() renders the SAME checks' real results.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");
const gate = async () =>
  (await import(pathToFileURL(path.join(CLIENT, "src", "link-hover-gate.mjs")).href)).candidatePageId;

// The one check-list both the assertion and the shown result drive — single-sourced.
const CHECKS = [
  { href: "https://google.com/search?q=x", denylist: ["google.com"], expected: null },
  // A subdomain of a denylisted host is denylisted too (hostMatches' suffix rule).
  { href: "https://www.google.com/search", denylist: ["google.com"], expected: null },
  // A host NOT on the list is unaffected by an otherwise non-empty denylist.
  { href: "https://example.com/x", denylist: ["google.com"], expected: "https://example.com/x" },
  // The non-removable code-level denylist (the Web Store) applies even with an empty user list.
  { href: "https://chrome.google.com/webstore", denylist: [], expected: null },
];

export default {
  description: "a link whose host is on the per-site denylist is never a link-hover lookup candidate",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const candidatePageId = await gate();
    for (const { href, denylist, expected } of CHECKS) {
      assert.equal(candidatePageId(href, denylist), expected, `${href} vs [${denylist}]`);
    }
  },
  show: async () => {
    const candidatePageId = await gate();
    return CHECKS.map(({ href, denylist }) => {
      const got = candidatePageId(href, denylist);
      const list = denylist.length ? `, deny [${denylist.join(", ")}]` : "";
      return `\`${new URL(href).host}${new URL(href).pathname}\`${list} → ${got === null ? "`null`" : "candidate"}`;
    }).join("; ");
  },
};
