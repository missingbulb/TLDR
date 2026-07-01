// 10.4 — An active category filter that matches NO notes shows a "No <Category> notes yet." status,
// not a blank/broken-looking panel (issue #25). Whole-panel `dom` state: seed notes that are all one
// category, then (via the action) click a DIFFERENT category's tab so the filtered list is empty and
// the explanatory status shows. The filter bar's selected tab also moves to the clicked category.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  description: 'an active filter with no matching notes shows "No <Category> notes yet."',
  tabUrl: "https://example.com/article",
  comments: [
    { commentId: "only-tldr", body: "Skip to §3 — the rest is setup.", authorName: "Dana", createdAt: REFERENCE_NOW_MS - 2 * DAY, category: "tldr" },
  ],
  // Click the "Spoiler" tab — there are no spoiler notes, so the panel shows the empty-category status.
  action: async (session) => {
    session.document.querySelector('[data-filter="spoiler"]').click();
  },
};
