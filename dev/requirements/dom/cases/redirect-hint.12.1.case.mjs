// 12.1 — A redirected landing page with no notes (issue #58): the empty state plus the redirect
// hint — "You were redirected here…" and the "Show notes for <cleaner URL>" button. Panel-level
// state (what's shown alongside the status/composer), so a whole-panel dom snapshot. The provenance
// record is seeded exactly as the service worker would have written it for the fake active tab
// (id 1); the key comes from the shipped module so this case can't drift from the real wiring.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");
const { provenanceKeyFor } = await import(pathToFileURL(path.join(CLIENT, "src", "redirect-provenance.mjs")).href);

const CLEAN = "https://example.com/article";
const LANDED = "https://example.com/article?session=abc123";

export default {
  description: "a redirected landing page with no notes shows the redirect hint and the cleaner-URL button",
  tabUrl: LANDED,
  comments: [],
  sessionSeed: { [provenanceKeyFor(1)]: { pendingUrl: null, lastCommittedUrl: LANDED, from: CLEAN } },
};
