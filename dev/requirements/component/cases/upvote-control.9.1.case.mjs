// 9.1 — A saved comment renders a vote rail on its LEFT (the ▲ button above the count), in the
// un-voted state (muted). Dated more than a day before the reference instant so the meta reads a
// stable absolute date (relative-time formatting is §4), keeping the golden deterministic.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  selector: "li.comment",
  description: "the left vote rail (▲ above the count) shows on a comment, un-voted (muted)",
  tabUrl: "https://example.com/article",
  comments: [
    {
      commentId: "v-unvoted",
      body: "This summary nails the second half.",
      authorName: "Ada",
      createdAt: REFERENCE_NOW_MS - 2 * DAY,
      voteCount: 3,
    },
  ],
};
