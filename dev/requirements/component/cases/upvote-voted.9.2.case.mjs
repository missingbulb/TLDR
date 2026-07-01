// 9.2 — The same rail in the voted-by-me state: a FILLED accent button + an accent count (already
// including your vote), so it's clear you've voted. The viewer's own vote can't ride the shared,
// CDN-cached public read (the cache key excludes Authorization), so it's seeded from
// chrome.storage.local (`myVotes`) exactly as the panel persists it — the panel overlays youVoted from
// that set on load (issue #22).
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  selector: "li.comment",
  description: "the same rail in the voted-by-me state (filled accent button + accent count)",
  tabUrl: "https://example.com/article",
  comments: [
    {
      commentId: "v-mine",
      body: "Mirrors my read exactly.",
      authorName: "You",
      createdAt: REFERENCE_NOW_MS - 2 * DAY,
      voteCount: 4,
    },
  ],
  local: { myVotes: ["v-mine"] },
};
