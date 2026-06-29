// 1.5 — A note with no author name is attributed to "Someone" (never a blank byline).
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  description: "a note with no author name is attributed to \"Someone\"",
  tabUrl: "https://example.com/article",
  comments: [{ commentId: "c1", body: "Anonymous but useful.", authorName: "", createdAt: REFERENCE_NOW_MS - 2 * 86_400_000 }],
};
