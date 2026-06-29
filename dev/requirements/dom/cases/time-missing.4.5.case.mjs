// 4.5 — A note with no timestamp shows an empty time — the meta reads just the author (never a bogus
// date or "NaN"). The visual confirms nothing follows the separator.
"use strict";

export default {
  description: "a note with no timestamp shows an empty time",
  tabUrl: "https://example.com/article",
  comments: [{ commentId: "t", body: "Solid summary.", authorName: "Ann", createdAt: undefined }],
};
