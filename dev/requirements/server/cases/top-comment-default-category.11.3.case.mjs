// 11.3 — GET /comments/top with NO `category` querystring defaults to DEFAULT_CATEGORY, the same
// additive-only optional-parameter contract (§9.1) POST /comments already applies to an absent
// category (10.9's write-side counterpart): an older/absent value never breaks, it just resolves to
// the default rather than being rejected.
"use strict";

async function run() {
  const { getTopComment, ddbMock, QueryCommand } = await import("../handler-harness.mjs");
  ddbMock.reset();
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  const res = await getTopComment({ pageUrl: "https://example.com/x" }); // no category
  return { res, ddbMock, QueryCommand };
}

export default {
  description: "GET /comments/top with no category defaults to DEFAULT_CATEGORY (chitchat) — the additive-only optional param",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { ddbMock, QueryCommand } = await run();
    const query = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    assert.equal(query.ExpressionAttributeValues[":categoryPageId"], "https://example.com/x#chitchat");
  },
  show: async () => {
    const { serverTxnLine } = await import("../show.mjs");
    const { res } = await run();
    return serverTxnLine({ method: "GET", route: "/comments/top?pageUrl=https://example.com/x", identity: "public (no category param)", res });
  },
};
