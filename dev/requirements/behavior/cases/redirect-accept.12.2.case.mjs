// 12.2 — Accepting the redirect offer (issue #58) switches the panel FULLY to the cleaner page id:
// its notes are fetched and shown, the page line renames to it, and the composer posts there — the
// owner-chosen "full switch" (not a read-only peek), so the thread consolidates under the shareable
// address. Drives the REAL sidepanel.mjs through the harness: land on the messy URL (0 notes, hint
// shown), click the button, watch the GET/render/POST all move to the cleaner page id. The gallery
// show() renders this same walk as text.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "extension");
const { provenanceKeyFor } = await import(pathToFileURL(path.join(CLIENT, "src", "redirect-provenance.mjs")).href);

const CLEAN = "https://example.com/article";
const LANDED = "https://example.com/article?session=abc123";

// The one scenario both the assertions and the shown result drive — single-sourced.
const SCENARIO = {
  tabUrl: LANDED,
  sessionSeed: { [provenanceKeyFor(1)]: { pendingUrl: null, lastCommittedUrl: LANDED, from: CLEAN } },
  // The landing page has no notes; the cleaner page carries the thread.
  commentsByPage: {
    [LANDED]: [],
    [CLEAN]: [{ commentId: "c1", body: "The canonical thread.", authorName: "Ada", createdAt: 1 }],
  },
};

const getUrls = (session) =>
  session.fetchLog.filter((c) => c.method === "GET").map((c) => new URL(c.url).searchParams.get("pageUrl"));

export default {
  description: "accepting the redirect offer switches the panel to the cleaner page id — notes, page line, and posting",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", SCENARIO);
    try {
      // Landed on the messy page: its (empty) read, the empty status, and the hint with the offer.
      assert.deepEqual(getUrls(session), [LANDED], "the initial read is for the landing page");
      assert.equal(session.text("status"), "No notes yet — be the first.");
      assert.equal(session.el("redirect-hint").hidden, false, "the redirect hint shows");
      assert.equal(session.text("redirect-hint-show"), `Show notes for ${CLEAN}`);

      session.el("redirect-hint-show").click();
      await session.settle();

      // The panel switched fully: the cleaner page's read, its notes, its id on the page line, no hint.
      assert.deepEqual(getUrls(session), [LANDED, CLEAN], "accepting fetches the cleaner page's notes");
      assert.equal(session.text("page"), CLEAN, "the page line renames to the cleaner page id");
      const bodies = [...session.document.querySelectorAll(".comment-body")].map((e) => e.textContent);
      assert.deepEqual(bodies, ["The canonical thread."], "the cleaner page's notes render");
      assert.equal(session.el("redirect-hint").hidden, true, "the hint is gone once switched");

      // And the composer posts THERE — the write is keyed to the cleaner page id.
      session.type("Adding to the canonical thread.");
      session.submit();
      await session.settle();
      const posts = session.fetchLog.filter((c) => c.method === "POST");
      assert.equal(posts.length, 1);
      assert.equal(JSON.parse(posts[0].body).pageUrl, CLEAN, "the new note posts under the cleaner page id");
    } finally {
      session.close();
    }
  },
  show: async () => {
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", SCENARIO);
    try {
      const before = session.text("redirect-hint-show");
      session.el("redirect-hint-show").click();
      await session.settle();
      const notes = session.document.querySelectorAll(".comment-body").length;
      session.type("Adding to the canonical thread.");
      session.submit();
      await session.settle();
      const post = session.fetchLog.filter((c) => c.method === "POST").map((c) => JSON.parse(c.body).pageUrl);
      return (
        `land on \`${LANDED}\` (0 notes) → hint → click “${before}” → ` +
        `\`GET /comments?pageUrl=${CLEAN}\` (${notes} note) → post → \`POST\` body.pageUrl=\`${post[0]}\``
      );
    } finally {
      session.close();
    }
  },
};
