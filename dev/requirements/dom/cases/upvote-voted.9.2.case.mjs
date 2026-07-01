// 9.2 — The same control in the voted-by-me state: an accent-coloured pill (accent border + ▲),
// count already including your vote. The viewer's own vote can't ride the shared, CDN-cached public
// read (the cache key excludes Authorization), so it's seeded from chrome.storage.local (`myVotes`)
// exactly as the panel persists it — the panel overlays youVoted from that set on load (issue #22).
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  description: "the same rail in the voted-by-me state (accent button + count, count includes your vote)",
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
