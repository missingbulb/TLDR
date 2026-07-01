// 10.5 — The composer renders a category selector, pre-selected to the composer default (TLDR, the
// first/primary category), issue #25. Cropped to the composer so this golden isolates the picker from
// the rest of the panel. The <select> renders as its selected option label plus a caret (satori has
// no form controls — the renderer projects the selected option, mirroring the textarea handling).
"use strict";

export default {
  selector: ".composer",
  description: "the composer renders a category selector, defaulting to TLDR",
  tabUrl: "https://example.com/article",
  comments: [],
};
