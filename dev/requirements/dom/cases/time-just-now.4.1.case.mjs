// 4.1 — A note less than a minute old reads "just now". Rendered visually: the note's meta line is
// the approved artifact. The age is a fixed offset from the pinned reference instant, so the image
// is deterministic.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  description: "a note under a minute old reads \"just now\"",
  tabUrl: "https://example.com/article",
  comments: [{ commentId: "t", body: "Solid summary.", authorName: "Ann", createdAt: REFERENCE_NOW_MS - 30_000 }],
};
