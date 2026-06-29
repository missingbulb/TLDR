// 2.3 — If the save fails, your note isn't lost: it stays, marked failed, the composer shows "Could
// not post — try again." (in red), and Post is enabled again so you can retry. Driven by the real
// gesture with the (mocked) save rejected, then settled — the snapshot is the failed state.
"use strict";

export default {
  description: "after a failed post, your note is kept (failed) with an error and Post is enabled",
  tabUrl: "https://example.com/article",
  comments: [],
  authFails: true,
  action: async (session) => {
    session.type("This should fail to post.");
    session.submit();
    await session.settle();
  },
};
