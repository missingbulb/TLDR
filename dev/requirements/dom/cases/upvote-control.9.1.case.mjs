// 9.1 — A saved comment row renders the upvote control with its count, in the un-voted state (a muted
// outline pill, ▲ + a plain count). Dated more than a day before the reference instant so the meta
// reads a stable absolute date (relative-time formatting is §4), keeping the golden deterministic.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  description: "a comment row shows the upvote control with its count, un-voted (muted outline pill)",
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
