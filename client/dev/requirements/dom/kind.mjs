// Kind: dom — a rendered-state requirement, verified by running the REAL side panel / options page
// (sidepanel.mjs / options.mjs, under jsdom + a fake chrome.*) and comparing the serialized DOM to
// a committed golden beside the case (cases/<slug>.<id>.golden.txt). The owner-approved expected is
// that golden. Lightweight by design: a readable text tree, not pixels (see README "rendering").
// Runner: shared/render/dom-snapshots.test.mjs.
"use strict";

export default { snapshot: true };
