// 1.6 — A note body that looks like HTML renders as LITERAL visible text — the markup shows as
// characters, it is not parsed into elements. (The serialized golden shows the raw "<b>…</b>" text
// in the comment body. The security counterpart — that no element is actually injected — is asserted
// by the behavior case 3.3.)
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

export default {
  description: "an HTML-looking note body renders as literal text, not parsed markup",
  tabUrl: "https://example.com/article",
  comments: [
    { commentId: "c1", body: "<b>not bold</b> & <i>not italic</i>", authorName: "Mallory", createdAt: REFERENCE_NOW_MS - 2 * 86_400_000 },
  ],
};
