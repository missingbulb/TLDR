// 11.5 — A hovered link is a link-hover lookup candidate ONLY if its href is http(s). Verified
// directly against the shipped, pure client/src/link-hover-gate.mjs (candidatePageId) — no DOM, no
// chrome.*, so no jsdom/harness is needed for this leaf. The gallery show() renders the SAME checks'
// real results as text, so the doc shows what the gate actually answered, not a "trust the runner" note.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");
const gate = async () =>
  (await import(pathToFileURL(path.join(CLIENT, "src", "link-hover-gate.mjs")).href)).candidatePageId;

// The one check-list both the assertion and the shown result drive — single-sourced. `expected` is the
// owner-approved answer for each href (null = never a lookup candidate).
const CHECKS = [
  { href: "mailto:someone@example.com", expected: null },
  { href: "javascript:alert(1)", expected: null },
  // The positive case, so this leaf also proves the gate ADMITS a plain http(s) link (not just that it
  // rejects the exotic schemes) — normalizePageUrl also drops the tracking param.
  { href: "https://example.com/x?utm_source=foo", expected: "https://example.com/x" },
];

export default {
  description: "a non-http(s) href (mailto:, javascript:) is never a link-hover lookup candidate",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const candidatePageId = await gate();
    for (const { href, expected } of CHECKS) {
      assert.equal(candidatePageId(href, []), expected, href);
    }
  },
  show: async () => {
    const candidatePageId = await gate();
    return CHECKS.map(({ href }) => {
      const got = candidatePageId(href, []);
      return `\`${href}\` → ${got === null ? "`null`" : `\`${got}\``}`;
    }).join("; ");
  },
};
