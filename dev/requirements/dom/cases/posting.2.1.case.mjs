// 2.1 — When you press Post, your note appears at once as "posting…" and Post is disabled until it's
// saved. Driven by the real gesture (type + submit) with the save frozen mid-flight (postHangs), so
// the snapshot is the in-flight state — the muted note + the disabled (greyed) Post button.
"use strict";

export default {
  description: "after you press Post, your note shows as \"posting…\" and Post is disabled",
  tabUrl: "https://example.com/article",
  comments: [],
  postHangs: true,
  action: async (session) => {
    session.type("Worth a read — the second half especially.");
    session.submit();
    await session.settle();
  },
};
