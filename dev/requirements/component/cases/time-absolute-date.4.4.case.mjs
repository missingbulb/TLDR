// 4.4 — A note a day or more old reads the absolute locale date (the meta line is the approved
// visual). The requirements lane runs with TZ=UTC and en-US (pinned in the npm scripts) so the
// formatted date is deterministic; the dom runner guards both.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  selector: "li.comment",
  description: "a note a day or more old reads the absolute locale date",
  tabUrl: "https://example.com/article",
  // Reference instant is 2026-06-28T12:00:00Z; two days earlier is 2026-06-26 (en-US: 6/26/2026).
  comments: [{ commentId: "t", body: "Solid summary.", authorName: "Ann", createdAt: REFERENCE_NOW_MS - 2 * 86_400_000 }],
};
