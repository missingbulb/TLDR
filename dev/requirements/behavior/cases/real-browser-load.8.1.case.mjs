// 8.1 — TBD (honesty leaf). The dom/behavior cases drive the real UI modules under jsdom + a fake
// chrome.* — faithful to our MODEL of Chrome, but not proof that a REAL Chrome loads the unpacked
// extension, opens the side panel on the toolbar click, and runs the service-worker glue. That layer
// is partially covered today by the `node --check` syntax pass in CI (client.yml) which catches a
// typo in the chrome.* glue; a real-Chrome end-to-end test (load unpacked → open the panel → render)
// is a tracked follow-up. Listed here so the requirement is visible and honestly marked
// unverified-here rather than silently absent.
"use strict";

export default {
  tbd: true,
  description: "the unpacked extension loads in a real Chrome: the toolbar click opens the side panel and its glue runs",
  coveredBy: "node --check of the chrome.* glue in .github/workflows/client.yml (a real-Chrome e2e is a tracked follow-up)",
};
