// 11.13 — The options page's "Hover previews" section, pinned as an owner-approved image: the title,
// the plain-language explanation of what granting means, and the toggle in its OFF-by-default state.
// A crop of the real options page render (same pipeline as 6.1's full-page image), scoped to the new
// section so unrelated options-page chrome (the denylist editor) can't force its re-approval.
"use strict";

export default {
  surface: "options",
  selector: "#hover-preview-section",
  description: "the options-page hover-previews section: title, explanation, and the off-by-default toggle",
  stored: ["localhost"], // a seeded denylist for the page load; not visible inside this crop
};
