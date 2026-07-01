// 9.3 — A comment nobody has voted on still renders the affordance, showing 0 (never a missing
// control). Proves the count defaults visibly rather than the pill being suppressed at zero.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  description: "a comment with zero votes still renders the affordance with 0, not a missing control",
  tabUrl: "https://example.com/article",
  comments: [
    {
      commentId: "v-zero",
      body: "First take — worth expanding later.",
      authorName: "Grace",
      createdAt: REFERENCE_NOW_MS - 3 * DAY,
      voteCount: 0,
    },
  ],
};
