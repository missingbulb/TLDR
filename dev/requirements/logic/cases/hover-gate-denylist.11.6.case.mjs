// 11.6 — A hovered link whose host is on the reader's per-site denylist is never a link-hover lookup
// candidate — the SAME evaluatePage gate (and so the SAME synced denylist) the side panel applies to
// the active tab (§4.2), reused verbatim via client/src/link-hover-gate.mjs's candidatePageId — never a
// separate policy that could drift from it.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "a link whose host is on the per-site denylist is never a link-hover lookup candidate",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { candidatePageId } = await import(pathToFileURL(path.join(CLIENT, "src", "link-hover-gate.mjs")).href);

    assert.equal(candidatePageId("https://google.com/search?q=x", ["google.com"]), null);
    // A subdomain of a denylisted host is denylisted too (hostMatches' suffix rule).
    assert.equal(candidatePageId("https://www.google.com/search", ["google.com"]), null);
    // A host NOT on the list is unaffected by an otherwise non-empty denylist.
    assert.equal(candidatePageId("https://example.com/x", ["google.com"]), "https://example.com/x");
    // The non-removable code-level denylist (the Web Store) applies even with an empty user list.
    assert.equal(candidatePageId("https://chrome.google.com/webstore", []), null);
  },
};
