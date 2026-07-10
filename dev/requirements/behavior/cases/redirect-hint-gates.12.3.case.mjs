// 12.3 — The redirect hint rides ONLY the genuine no-notes state (issue #58): a page WITH notes never
// shows it (even after a qualifying redirect), a page reached with NO qualifying arrival never shows
// it, and a FAILED read never shows it (a failure proves nothing about the page having no notes).
// Three real walks through the harness-driven sidepanel.mjs.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "extension");
const { provenanceKeyFor } = await import(pathToFileURL(path.join(CLIENT, "src", "redirect-provenance.mjs")).href);

const CLEAN = "https://example.com/article";
const LANDED = "https://example.com/article?session=abc123";
const PROVENANCE = { [provenanceKeyFor(1)]: { pendingUrl: null, lastCommittedUrl: LANDED, from: CLEAN } };

export default {
  description: "the redirect hint shows only in the no-notes state — never with notes, without a qualifying arrival, or on a failed read",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");

    // A qualifying arrival, but the landing page HAS notes: no hint (the thread is right here).
    let session = await open("sidepanel", {
      tabUrl: LANDED,
      sessionSeed: PROVENANCE,
      comments: [{ commentId: "c1", body: "Already discussed here.", authorName: "Ada", createdAt: 1 }],
    });
    try {
      assert.equal(session.document.querySelectorAll(".comment-body").length, 1, "the landing page's note renders");
      assert.equal(session.el("redirect-hint").hidden, true, "a page with notes shows no hint");
    } finally {
      session.close();
    }

    // No qualifying arrival (no provenance record): the plain empty state, no hint.
    session = await open("sidepanel", { tabUrl: LANDED, comments: [] });
    try {
      assert.equal(session.text("status"), "No notes yet — be the first.");
      assert.equal(session.el("redirect-hint").hidden, true, "no redirect, no hint");
    } finally {
      session.close();
    }

    // A qualifying arrival but the read FAILS: the failure status, no hint on top of it.
    session = await open("sidepanel", { tabUrl: LANDED, sessionSeed: PROVENANCE, readFails: true });
    try {
      assert.equal(session.text("status"), "Couldn't load notes.");
      assert.equal(session.el("redirect-hint").hidden, true, "a failed read shows no hint");
    } finally {
      session.close();
    }
  },
};
