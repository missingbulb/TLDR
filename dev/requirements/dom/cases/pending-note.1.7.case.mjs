// 1.7 — A just-posted note appears immediately in a "pending" treatment ("<author> · posting…",
// muted) before the server confirms it. Driven by submitting a note with the post frozen mid-flight
// (postHangs), so the optimistic state is what gets snapshotted.
"use strict";

export default {
  description: "an optimistic (just-posted) note shows the pending treatment and \"posting…\" meta",
  tabUrl: "https://example.com/article",
  comments: [],
  postHangs: true,
  action: async (session) => {
    session.type("Worth a read — the second half especially.");
    session.submit();
    // Let the in-flight write PARK on the frozen post while the fakes are installed (so nothing
    // touches a torn-down global after the snapshot). It never resolves, so the note stays pending.
    await session.settle();
  },
};
