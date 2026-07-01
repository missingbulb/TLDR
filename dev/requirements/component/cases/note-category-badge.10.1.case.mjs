// 10.1 — A note renders a category badge for its tagged category (issue #25). Cropped to the comment
// row so the badge shows in place on the meta line, beside the byline. Dated more than a day before
// the reference instant so the meta reads a stable absolute date (relative-time formatting is §4).
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  selector: "li.comment",
  description: "a note shows a category badge (its tagged category) on the meta line",
  tabUrl: "https://example.com/article",
  comments: [
    {
      commentId: "cat-badge",
      body: "The mentor was the villain all along.",
      authorName: "Sam",
      createdAt: REFERENCE_NOW_MS - 2 * DAY,
      category: "spoiler",
      voteCount: 2,
    },
  ],
};
