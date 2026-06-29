// 2.5 — After a successful post, your note shows as a normal saved note (the "posting…" treatment is
// gone) and Post is enabled again. Driven by submitting a note and letting the (mocked) save succeed,
// so the snapshot is the settled, confirmed state.
"use strict";

export default {
  description: "after a successful post the note is saved and Post is enabled again",
  tabUrl: "https://example.com/article",
  comments: [],
  action: async (session) => {
    session.type("Just posted this — the renderer is the star.");
    session.submit();
    await session.settle();
  },
};
