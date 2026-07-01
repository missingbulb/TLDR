// 10.1 — The panel wears the CURRENT category's look & feel (issue #25). In TLDR mode: blue comment
// separators and a blue "Post tl;dr" composer. Whole-panel `dom` state, category seeded via
// chrome.storage.local. Notes dated more than a day back so the meta reads a stable absolute date.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  description: "the panel in TLDR mode: blue separators and a 'Post tl;dr' composer",
  tabUrl: "https://example.com/article",
  local: { currentCategory: "tldr" },
  comments: [
    { commentId: "t1", body: "Skip to §3 — the rest is setup.", authorName: "Dana", createdAt: REFERENCE_NOW_MS - 2 * DAY, category: "tldr", voteCount: 5 },
    { commentId: "t2", body: "Core claim: it's latency, not throughput.", authorName: "Lee", createdAt: REFERENCE_NOW_MS - 3 * DAY, category: "tldr", voteCount: 2 },
  ],
};
