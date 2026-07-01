// 4.2 — A note minutes old reads "Nm ago" (the meta line is the approved visual).
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  selector: "li.comment",
  description: "a note minutes old reads \"Nm ago\"",
  tabUrl: "https://example.com/article",
  comments: [{ commentId: "t", body: "Solid summary.", authorName: "Ann", createdAt: REFERENCE_NOW_MS - 5 * 60_000 }],
};
