// 11.5 — A hovered link is a link-hover lookup candidate ONLY if its href is http(s). Verified
// directly against the shipped, pure client/src/link-hover-gate.mjs (candidatePageId) — no DOM, no
// chrome.*, so no jsdom/harness is needed for this leaf.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "a non-http(s) href (mailto:, javascript:) is never a link-hover lookup candidate",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { candidatePageId } = await import(pathToFileURL(path.join(CLIENT, "src", "link-hover-gate.mjs")).href);

    assert.equal(candidatePageId("mailto:someone@example.com", []), null);
    assert.equal(candidatePageId("javascript:alert(1)", []), null);
    // The positive case, so this leaf also proves the gate ADMITS a plain http(s) link (not just that
    // it rejects the exotic schemes) — normalizePageUrl also drops the tracking param.
    assert.equal(candidatePageId("https://example.com/x?utm_source=foo", []), "https://example.com/x");
  },
};
