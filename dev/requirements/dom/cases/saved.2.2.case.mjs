// 2.2 — Once the save succeeds, your note becomes a normal saved note (the "posting…" treatment is
// gone) and Post is enabled (blue) again. Driven by the real gesture with the (mocked) save
// succeeding, then settled — so the snapshot is the confirmed, ready-to-post-again state.
"use strict";

export default {
  description: "after a successful post, your note is saved and Post is enabled again",
  tabUrl: "https://example.com/article",
  comments: [],
  action: async (session) => {
    session.type("Just posted this — the renderer is the star.");
    session.submit();
    await session.settle();
  },
};
