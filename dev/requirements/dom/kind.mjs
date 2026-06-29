// Kind: dom — a rendered-state requirement, verified by running the REAL side panel / options page
// (sidepanel.mjs / options.mjs, under jsdom + a fake chrome.*), rasterizing it with the real
// sidepanel.css (satori → resvg), and comparing pixel-exact to a committed PNG beside the case
// (cases/<slug>.<id>.png). That image is the owner-approved expected, embedded inline in the
// requirements gallery for visual approval. Runner: shared/render/dom-snapshots.test.mjs.
"use strict";

export default { snapshot: true };
