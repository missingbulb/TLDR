// 1.3 — Notes render one list item each (body + "<author> · <time>" meta), oldest first / newest
// last. Both notes are dated more than a day before the reference instant so their meta reads a
// stable absolute date (the relative-time formats are §4); this keeps the golden deterministic.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";
const DAY = 86_400_000;

export default {
  selector: ".comments",
  description: "each note is a list item with its body and a `<author> · <time>` meta, chronological",
  tabUrl: "https://example.com/article",
  comments: [
    { commentId: "c2", body: "Skim the methodology section — it's the crux.", authorName: "Ada", createdAt: REFERENCE_NOW_MS - 2 * DAY },
    { commentId: "c1", body: "Counterpoint in the comments is worth a read.", authorName: "Grace", createdAt: REFERENCE_NOW_MS - 3 * DAY },
  ],
};
