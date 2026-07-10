// 12.4 — The offer rule (issue #58, the owner-chosen gate): a redirect earns the "show notes for the
// cleaner URL" offer only when the source is same-site AND strictly cleaner AND a different page id.
// Verified directly against the shipped, pure extension/src/redirect-provenance.mjs (cleanerSourceOffer)
// — no DOM, no chrome.*. The gallery show() renders the SAME checks' real answers as text.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "extension");
const rule = async () =>
  (await import(pathToFileURL(path.join(CLIENT, "src", "redirect-provenance.mjs")).href)).cleanerSourceOffer;

// The one check-list both the assertion and the shown result drive — single-sourced. `expected` is
// the owner-approved answer for each redirect (null = the offer is never made).
const CHECKS = [
  // The archetype: the redirect added params on the same site — offer the pre-redirect page.
  { fromUrl: "https://example.com/article", toUrl: "https://example.com/article?session=abc123", expected: { pageId: "https://example.com/article" } },
  // A cross-site hop (a link shortener) never prompts, however messy the target.
  { fromUrl: "https://t.co/x9", toUrl: "https://example.com/some/long/article?id=1", expected: null },
  // A tracking-only difference normalizes to the SAME page id — nothing to offer.
  { fromUrl: "https://example.com/a?utm_source=nl", toUrl: "https://example.com/a", expected: null },
  // The redirect went the OTHER way (to a shorter URL) — the source isn't the cleaner one.
  { fromUrl: "https://example.com/a?x=1&y=2", toUrl: "https://example.com/a?x=1", expected: null },
];

export default {
  description: "the offer is made only for a same-site redirect from a strictly-cleaner, different page id",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const cleanerSourceOffer = await rule();
    for (const { fromUrl, toUrl, expected } of CHECKS) {
      assert.deepEqual(cleanerSourceOffer({ fromUrl, toUrl }), expected, `${fromUrl} → ${toUrl}`);
    }
  },
  show: async () => {
    const cleanerSourceOffer = await rule();
    return CHECKS.map(({ fromUrl, toUrl }) => {
      const got = cleanerSourceOffer({ fromUrl, toUrl });
      return `\`${fromUrl}\` → \`${toUrl}\` ⇒ ${got === null ? "`null`" : `offer \`${got.pageId}\``}`;
    }).join("; ");
  },
};
