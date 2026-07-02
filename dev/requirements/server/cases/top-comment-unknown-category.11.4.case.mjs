// 11.4 — GET /comments/top with an UNKNOWN, present category value is rejected (400) BEFORE any query
// runs — the same resolveCategory validation POST /comments already applies (10.9's counterpart): the
// client only ever offers the known list, so a present-but-unknown value is a client bug, not a
// legitimate "nothing here yet" empty state (that's 11.2, a 200).
"use strict";

async function run() {
  const { getTopComment, ddbMock, QueryCommand } = await import("../handler-harness.mjs");
  ddbMock.reset();
  const res = await getTopComment({ pageUrl: "https://example.com/x", category: "rating" });
  return { res, ddbMock, QueryCommand };
}

export default {
  description: "GET /comments/top with an unknown category is rejected (400) before any query runs",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { res, ddbMock, QueryCommand } = await run();
    assert.equal(res.statusCode, 400);
    assert.equal(ddbMock.commandCalls(QueryCommand).length, 0, "rejected before any DynamoDB query");
  },
  show: async () => {
    const { serverTxnLine } = await import("../show.mjs");
    const { res } = await run();
    return serverTxnLine({ method: "GET", route: "/comments/top?pageUrl=https://example.com/x&category=rating", identity: "public", res });
  },
};
