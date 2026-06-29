// Tiny helper for the §4 time-formatting cases: render a single note at a given createdAt through
// the REAL panel and return its meta line ("<author> · <time>"). The time formatter (timeAgo) is
// private to sidepanel.mjs, so the only faithful way to assert it is through the render — this gives
// the §4 cases one shared, lazily-imported entry point instead of five copies of the harness dance.
"use strict";

import { open } from "./harness.mjs";

export async function noteMetaFor(createdAt, { authorName = "Ann" } = {}) {
  const session = await open("sidepanel", {
    tabUrl: "https://example.com/article",
    comments: [{ commentId: "t", body: "x", authorName, createdAt }],
  });
  try {
    return session.el("comments").querySelector(".comment-meta").textContent;
  } finally {
    session.close();
  }
}
