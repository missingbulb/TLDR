// 9.7 — A first POST .../vote records one vote and sets the count to 1; a repeat by the same user is
// idempotent (still 1). The real handler issues ONE TransactWriteItems: the vote item created only if
// absent (attribute_not_exists) + a +1 to the comment's voteCount. On a duplicate, the vote-item
// condition fails and the whole transaction cancels — the handler treats that as success, so the
// count is never double-bumped.
"use strict";

export default {
  description: "a first vote records one vote and sets the count to 1; a repeat by the same user is idempotent",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { vote, ddbMock, TransactWriteCommand, VALID_CLAIMS } = await import("../handler-harness.mjs");

    // First cast: exactly one transaction, guarded Put + a +1 to voteCount.
    ddbMock.reset();
    let res = await vote({ claims: VALID_CLAIMS, body: { pageUrl: "https://example.com/x" } });
    assert.equal(res.statusCode, 200);
    const txns = ddbMock.commandCalls(TransactWriteCommand);
    assert.equal(txns.length, 1, "one atomic vote+count write");
    const items = txns[0].args[0].input.TransactItems;
    assert.match(items[0].Put.ConditionExpression, /attribute_not_exists/, "the vote is created only if absent");
    assert.match(items[1].Update.UpdateExpression, /ADD voteCount :one/);
    assert.equal(items[1].Update.ExpressionAttributeValues[":one"], 1);

    // Repeat by the same user: the vote-item condition fails → idempotent success, no error.
    ddbMock.reset();
    ddbMock.on(TransactWriteCommand).rejects(
      Object.assign(new Error("cancelled"), {
        name: "TransactionCanceledException",
        CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }],
      }),
    );
    res = await vote({ claims: VALID_CLAIMS, body: { pageUrl: "https://example.com/x" } });
    assert.equal(res.statusCode, 200, "a duplicate vote is an idempotent success, not an error");
  },
};
