// 11.14 — TBD (honesty leaf, the issue #26 counterpart to 8.1). The 11.5-11.10 cases drive the real
// extension/src/link-hover.mjs under jsdom + a fake chrome.* — faithful to our MODEL of a dynamically
// registered content script, but not proof that a REAL Chrome actually fires chrome.scripting's
// registration on a real third-party page and that the resulting hover/tooltip round-trip works there.
// That layer is partially covered today by the `node --check` syntax pass in CI (test-extension.yml); a
// real-Chrome end-to-end test (grant the permission, browse a real page, hover a real link) is a
// tracked follow-up, the same one 8.1 names for the rest of the extension's chrome.* glue.
"use strict";

export default {
  tbd: true,
  description: "the dynamically-registered content script actually intercepts hovers on a real third-party page in real Chrome",
  coveredBy: "node --check of the chrome.* glue in .github/workflows/test-extension.yml (a real-Chrome e2e is a tracked follow-up)",
};
