// 11.2 — When nothing has been posted in a page+category yet, GET /comments/top returns `{ comment:
// null }` with a 200 — an absent leader is an expected empty state (the link-hover popup then shows
// nothing, issue #26's `11.8`), never a 404/error the client would have to special-case.
"use strict";

async function run() {
  const { getTopComment, ddbMock, QueryCommand } = await import("../handler-harness.mjs");
  ddbMock.reset();
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  const res = await getTopComment({ pageUrl: "https://example.com/x", category: "spoiler" });
  return { res };
}

export default {
  description: "GET /comments/top returns { comment: null } with a 200 when the category has no comments yet",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { res } = await run();
    assert.equal(res.statusCode, 200, "an empty category is a success, not a 404");
    assert.deepEqual(JSON.parse(res.body), { comment: null });
  },
  show: async () => {
    const { serverTxnLine } = await import("../show.mjs");
    const { res } = await run();
    return serverTxnLine({ method: "GET", route: "/comments/top?pageUrl=https://example.com/x&category=spoiler", identity: "public", res });
  },
};
