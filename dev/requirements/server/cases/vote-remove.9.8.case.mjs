// 9.8 — DELETE .../vote removes the vote and decrements; deleting a vote that was never cast is a
// no-op success. The real handler issues ONE TransactWriteItems: delete the vote item only if present
// + a -1 to voteCount. When there's no vote to remove, the Delete's condition fails and the whole
// transaction cancels — the handler treats that as an idempotent no-op (200), not an error.
"use strict";

export default {
  description: "removing a vote deletes it and decrements; removing a vote never cast is a no-op success",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { vote, ddbMock, TransactWriteCommand, VALID_CLAIMS } = await import("../handler-harness.mjs");

    // Toggle off: one transaction, guarded Delete + a -1 to voteCount.
    ddbMock.reset();
    let res = await vote({ method: "DELETE", claims: VALID_CLAIMS, body: { pageUrl: "https://example.com/x" } });
    assert.equal(res.statusCode, 200);
    const items = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems;
    assert.match(items[0].Delete.ConditionExpression, /attribute_exists/, "the vote is removed only if present");
    assert.match(items[1].Update.UpdateExpression, /ADD voteCount :neg/);
    assert.equal(items[1].Update.ExpressionAttributeValues[":neg"], -1);

    // Nothing to remove: the Delete's condition fails → idempotent no-op success.
    ddbMock.reset();
    ddbMock.on(TransactWriteCommand).rejects(
      Object.assign(new Error("cancelled"), {
        name: "TransactionCanceledException",
        CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }],
      }),
    );
    res = await vote({ method: "DELETE", claims: VALID_CLAIMS, body: { pageUrl: "https://example.com/x" } });
    assert.equal(res.statusCode, 200, "deleting a non-existent vote succeeds (no-op)");
  },
};
