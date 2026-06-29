// 3.3 — A note body is inserted as TEXT, never parsed as HTML: a body crafted to inject an element
// produces no such element in the DOM, and the body's text equals the raw string verbatim. This is
// the security counterpart to the literal-text rendering snapshotted in 1.6. Note bodies are
// untrusted (anyone can post one), so this is a real XSS guard, not a cosmetic one.
"use strict";

import { REFERENCE_NOW_MS } from "../../shared/reference-time.mjs";

const PAYLOAD = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

export default {
  description: "a note body is inserted as text — a crafted body injects no element (XSS-safe)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", {
      tabUrl: "https://example.com/article",
      comments: [{ commentId: "x", body: PAYLOAD, authorName: "Mallory", createdAt: REFERENCE_NOW_MS - 86_400_000 }],
    });
    try {
      const list = session.el("comments");
      assert.equal(list.querySelector("img"), null, "no <img> element was injected");
      assert.equal(list.querySelector("script"), null, "no <script> element was injected");
      assert.equal(list.querySelector(".comment-body").textContent, PAYLOAD, "the body renders as the raw string");
    } finally {
      session.close();
    }
  },
};
