// 9.6 — On a refresh, mergeComments keeps the server's voteCount authoritative while preserving the
// viewer's local youVoted — because the server CAN'T know your vote (the public read is shared and
// cache-keyed without Authorization). A non-visual merge rule, asserted against the shipped
// optimistic.mjs so a regression that drops youVoted on refresh fails loudly.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "mergeComments keeps the server voteCount authoritative while preserving the local youVoted",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { mergeComments } = await import(pathToFileURL(path.join(CLIENT, "src", "optimistic.mjs")).href);

    // The server record now carries the authoritative count (9), no youVoted; the local copy knew mine.
    const server = [{ commentId: "a", body: "A", createdAt: 1, voteCount: 9 }];
    const local = [{ commentId: "a", body: "A", createdAt: 1, voteCount: 8, youVoted: true }];
    const [merged] = mergeComments(server, local);
    assert.equal(merged.voteCount, 9, "the server count wins");
    assert.equal(merged.youVoted, true, "the viewer's own vote survives the refresh");
  },
};
