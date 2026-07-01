// 10.10 — The third category's sample: the panel in Chitchat mode — green comment separators and a
// green "Post chit-chat" composer (issue #25). With TLDR (10.1) and Spoiler (10.2), this completes the
// per-category look & feel set; Chitchat is also the default view (DEFAULT_CATEGORY).
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  description: "the panel in Chitchat mode: green separators and a 'Post chit-chat' composer",
  tabUrl: "https://example.com/article",
  local: { currentCategory: "chitchat" },
  comments: [
    { commentId: "c1", body: "Anyone else love the little sidebar redesign?", authorName: "Ori", createdAt: REFERENCE_NOW_MS - 2 * DAY, category: "chitchat", voteCount: 1 },
  ],
};
