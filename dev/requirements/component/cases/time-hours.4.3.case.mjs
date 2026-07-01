// 4.3 — A note hours old reads "Nh ago" (the meta line is the approved visual).
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  selector: "li.comment",
  description: "a note hours old reads \"Nh ago\"",
  tabUrl: "https://example.com/article",
  comments: [{ commentId: "t", body: "Solid summary.", authorName: "Ann", createdAt: REFERENCE_NOW_MS - 3 * 3_600_000 }],
};
