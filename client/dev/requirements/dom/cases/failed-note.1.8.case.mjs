// 1.8 — When a post fails, the note stays visible in a "failed" treatment ("<author> · failed to
// post") and the composer shows an inline error — the user's text is never lost. Driven by
// submitting with the auth/post step rejected, then letting it settle into the failed state.
"use strict";

export default {
  description: "a failed post shows the failed treatment and the composer error",
  tabUrl: "https://example.com/article",
  comments: [],
  authFails: true,
  action: async (session) => {
    session.type("This should fail to post.");
    session.submit();
    await session.settle();
  },
};
