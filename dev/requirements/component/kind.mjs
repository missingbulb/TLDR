// The `component` kind: a snapshot of a CROPPED element, not the whole panel. A case supplies the
// same fake inputs as a `dom` case PLUS a `selector` (e.g. `li.comment`, `.comments`); the shared
// snapshot runner renders the real panel through the harness and rasterizes only that element. Same
// pixel-exact comparison and same owner-approved committed-PNG baseline as `dom` — it just crops the
// interesting visual element, so a requirement about one element's internal appearance isn't
// re-rendered or re-approved when unrelated panel chrome (the header title, the composer) changes.
// See the requirements README, "Component (cropped-element) snapshots".
"use strict";

export default { snapshot: true };
