// 10.2 — The SAME panel in a DIFFERENT category wears a different look & feel (issue #25). In Spoiler
// mode: red comment separators and a red "Post spoiler" composer — visibly distinct from TLDR (10.1),
// proving the per-category design. Category seeded via chrome.storage.local.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  description: "the same panel in Spoiler mode: red separators and a 'Post spoiler' composer",
  tabUrl: "https://example.com/article",
  local: { currentCategory: "spoiler" },
  comments: [
    { commentId: "s1", body: "The mentor was the villain all along.", authorName: "Sam", createdAt: REFERENCE_NOW_MS - 2 * DAY, category: "spoiler", voteCount: 4 },
  ],
};
