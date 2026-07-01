// Handler tests. DynamoDB is mocked at the AWS SDK boundary (aws-sdk-client-mock); all the
// handler logic — auth-claim checks, normalization, validation, rate-limit branch, projection,
// pagination — runs for real.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

process.env.TABLE_NAME = 'tldr-comments-test';
process.env.RATE_LIMIT_PER_MINUTE = '10';

const ddbMock = mockClient(DynamoDBDocumentClient);
const { handler } = await import('../src/handler.mjs');

// The handler logs a per-request telemetry line (the X-Client-Version cohort). Capture it so the
// suite output stays clean and a case can assert it; restore the real console.log afterward.
const realLog = console.log;
let logs = [];

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(UpdateCommand).resolves({});
  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  ddbMock.on(TransactWriteCommand).resolves({});
  logs = [];
  console.log = (...args) => logs.push(args);
});

afterEach(() => {
  console.log = realLog;
});

const VALID_CLAIMS = { sub: 'user-123', name: 'Ada', email: 'ada@example.com', email_verified: 'true' };

function postEvent({ claims = VALID_CLAIMS, body, isBase64Encoded = false, headers } = {}) {
  return {
    requestContext: { http: { method: 'POST', path: '/comments' }, authorizer: { jwt: { claims } } },
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded,
  };
}

function getEvent(queryStringParameters, headers) {
  return { requestContext: { http: { method: 'GET', path: '/comments' } }, headers, queryStringParameters };
}

function conditionalFailure() {
  return Object.assign(new Error('conditional check failed'), {
    name: 'ConditionalCheckFailedException',
  });
}

// A DynamoDB TransactWriteItems cancellation: `codes` aligns with the TransactItems (index 0 = the
// vote Put/Delete, index 1 = the comment voteCount Update). 'None' = that item was fine; the cancel
// came from a sibling.
function transactionCanceled(codes) {
  return Object.assign(new Error('transaction cancelled'), {
    name: 'TransactionCanceledException',
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

const SAMPLE_COMMENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function voteEvent({ method = 'POST', claims = VALID_CLAIMS, commentId = SAMPLE_COMMENT_ID, body = { pageUrl: 'https://example.com/x' } } = {}) {
  return {
    requestContext: {
      routeKey: `${method} /comments/{commentId}/vote`,
      http: { method, path: `/comments/${commentId}/vote` },
      authorizer: { jwt: { claims } },
    },
    pathParameters: { commentId },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

test('POST creates a comment and echoes the authoritative record', async () => {
  const res = await handler(postEvent({ body: { pageUrl: 'https://example.com/x', body: '  hi  ' } }));
  assert.equal(res.statusCode, 201);
  const { comment } = JSON.parse(res.body);
  assert.equal(comment.body, 'hi'); // trimmed
  assert.equal(comment.authorName, 'Ada');
  assert.equal(comment.authorId, 'user-123');
  assert.equal(typeof comment.commentId, 'string');
  assert.equal(typeof comment.createdAt, 'number');
  // No category sent → the default (chitchat) is stored and echoed (additive-only: optional field).
  assert.equal(comment.category, 'chitchat');

  const puts = ddbMock.commandCalls(PutCommand);
  assert.equal(puts.length, 1);
  const item = puts[0].args[0].input.Item;
  assert.equal(item.pageId, 'https://example.com/x');
  assert.equal(item.authorSub, 'user-123');
  assert.equal(item.body, 'hi');
  assert.equal(item.category, 'chitchat');
  assert.equal(item.createdAt, comment.createdAt);
  assert.ok(!('authorEmail' in item), 'raw authorEmail must never be stored');
  assert.match(item.authorEmailHash, /^[0-9a-f]{64}$/, 'a salted sha256 email hash is stored');
  assert.notEqual(item.authorEmailHash, 'ada@example.com', 'the stored value is a hash, not the email');
  assert.ok(!('authorEmailHash' in comment), 'the email hash is never returned to clients');
});

test('the same email always hashes to the same value (moderation correlation)', async () => {
  await handler(postEvent({ body: { pageUrl: 'https://e.com/1', body: 'a' } }));
  await handler(postEvent({ body: { pageUrl: 'https://e.com/2', body: 'b' } }));
  const puts = ddbMock.commandCalls(PutCommand);
  assert.equal(puts[0].args[0].input.Item.authorEmailHash, puts[1].args[0].input.Item.authorEmailHash);
});

test('POST re-normalizes the pageUrl defensively (does not trust the client)', async () => {
  await handler(postEvent({ body: { pageUrl: 'https://Example.com/A/?utm_source=x#frag', body: 'hi' } }));
  const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
  assert.equal(item.pageId, 'https://example.com/A');
  assert.equal(item.pageUrlRaw, 'https://Example.com/A/?utm_source=x#frag');
});

test('POST without a verified email is rejected (403)', async () => {
  const res = await handler(
    postEvent({ claims: { sub: 'u', name: 'X', email_verified: 'false' }, body: { pageUrl: 'https://e.com', body: 'hi' } }),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(ddbMock.commandCalls(PutCommand).length, 0);
});

test('POST without an identity is rejected (401)', async () => {
  const res = await handler(postEvent({ claims: {}, body: { pageUrl: 'https://e.com', body: 'hi' } }));
  assert.equal(res.statusCode, 401);
});

test('POST with a non-http(s) pageUrl is rejected (400)', async () => {
  const res = await handler(postEvent({ body: { pageUrl: 'chrome://newtab', body: 'hi' } }));
  assert.equal(res.statusCode, 400);
  assert.equal(ddbMock.commandCalls(PutCommand).length, 0);
});

test('POST with an empty body is rejected (400)', async () => {
  const res = await handler(postEvent({ body: { pageUrl: 'https://e.com', body: '   ' } }));
  assert.equal(res.statusCode, 400);
});

test('POST with an oversized body is rejected (413)', async () => {
  const res = await handler(postEvent({ body: { pageUrl: 'https://e.com', body: 'x'.repeat(9000) } }));
  assert.equal(res.statusCode, 413);
});

test('POST over the per-author rate limit is rejected (429) and writes nothing', async () => {
  ddbMock.on(UpdateCommand).rejects(conditionalFailure());
  const res = await handler(postEvent({ body: { pageUrl: 'https://e.com', body: 'hi' } }));
  assert.equal(res.statusCode, 429);
  assert.equal(ddbMock.commandCalls(PutCommand).length, 0);
});

test('POST with a malformed JSON body is rejected (400)', async () => {
  const res = await handler(postEvent({ body: '{not json' }));
  assert.equal(res.statusCode, 400);
});

test('POST stores and echoes a valid category (normalized to its canonical id)', async () => {
  const res = await handler(postEvent({ body: { pageUrl: 'https://e.com', body: 'hi', category: ' Spoiler ' } }));
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).comment.category, 'spoiler'); // trimmed + lowercased against the allowlist
  assert.equal(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item.category, 'spoiler');
});

test('POST with an unknown category is rejected (400) and writes nothing', async () => {
  const res = await handler(postEvent({ body: { pageUrl: 'https://e.com', body: 'hi', category: 'rating' } }));
  assert.equal(res.statusCode, 400);
  assert.equal(ddbMock.commandCalls(PutCommand).length, 0);
});

test('POST with no category stores the default (chitchat) — the additive-only optional field', async () => {
  await handler(postEvent({ body: { pageUrl: 'https://e.com', body: 'hi' } }));
  assert.equal(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item.category, 'chitchat');
});

test('GET returns comments via the allowlist projection (no internal fields leak)', async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [
      {
        pageId: 'https://example.com/x',
        commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        authorSub: 'user-123',
        authorName: 'Ada',
        body: 'first!',
        category: 'tldr',
        createdAt: 1700000000000,
        pageUrlRaw: 'https://example.com/x?utm=1',
        voteCount: 4,
        voterSub: 'should-never-leak', // an internal vote-bookkeeping field must not surface
      },
    ],
    LastEvaluatedKey: { pageId: 'https://example.com/x', commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
  });

  const res = await handler(getEvent({ pageUrl: 'https://example.com/x' }));
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.comments.length, 1);
  const c = out.comments[0];
  // The projected key-set is pinned (§9.1 additive-only): a field can only be ADDED here, never
  // removed/renamed. `category` is the second field added under that policy (after `voteCount`).
  assert.deepEqual(Object.keys(c).sort(), ['authorId', 'authorName', 'body', 'category', 'commentId', 'createdAt', 'voteCount']);
  assert.equal(c.authorId, 'user-123');
  assert.equal(c.category, 'tldr');
  assert.equal(c.voteCount, 4);
  assert.ok(!('authorSub' in c) && !('pageUrlRaw' in c) && !('pageId' in c) && !('voterSub' in c));
  assert.equal(typeof out.nextToken, 'string');

  const query = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
  assert.equal(query.ScanIndexForward, true);
  assert.ok(!('ConsistentRead' in query) || query.ConsistentRead !== true);
  // The read bounds the sort key below the vote-item prefix so a page's votes never surface as comments.
  assert.match(query.KeyConditionExpression, /commentId < :voteSentinel/);
  assert.equal(query.ExpressionAttributeValues[':voteSentinel'], 'VOTE#');
});

test('GET defaults voteCount to 0 for a comment that has never been voted on', async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [{ pageId: 'https://e.com', commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', authorName: 'Ada', body: 'hi', createdAt: 1 }],
  });
  const out = JSON.parse((await handler(getEvent({ pageUrl: 'https://e.com' }))).body);
  assert.equal(out.comments[0].voteCount, 0);
});

test('GET defaults category to chitchat for a legacy row written before categories existed', async () => {
  // No `category` attribute on the stored item (a pre-#25 row) → the projection defaults it at read
  // time, so the client never sees a blank/undefined category. Zero migration/backfill.
  ddbMock.on(QueryCommand).resolves({
    Items: [{ pageId: 'https://e.com', commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', authorName: 'Ada', body: 'hi', createdAt: 1 }],
  });
  const out = JSON.parse((await handler(getEvent({ pageUrl: 'https://e.com' }))).body);
  assert.equal(out.comments[0].category, 'chitchat');
});

test('GET round-trips an opaque nextToken into ExclusiveStartKey', async () => {
  const key = { pageId: 'https://example.com/x', commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' };
  const token = Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
  await handler(getEvent({ pageUrl: 'https://example.com/x', nextToken: token }));
  const query = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
  assert.deepEqual(query.ExclusiveStartKey, key);
});

test('GET without a pageUrl is rejected (400)', async () => {
  const res = await handler(getEvent({}));
  assert.equal(res.statusCode, 400);
});

test('unknown routes return 404', async () => {
  const res = await handler({ requestContext: { http: { method: 'DELETE', path: '/comments' } } });
  assert.equal(res.statusCode, 404);
});

// --- voting -----------------------------------------------------------------

test('POST .../vote casts one vote: a vote item keyed by VOTE#<commentId>#<sub> + an atomic count bump', async () => {
  const res = await handler(voteEvent({}));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });

  const txns = ddbMock.commandCalls(TransactWriteCommand);
  assert.equal(txns.length, 1);
  const items = txns[0].args[0].input.TransactItems;
  // Item 0: the vote item, created only if absent (idempotent cast).
  assert.deepEqual(items[0].Put.Item.commentId, `VOTE#${SAMPLE_COMMENT_ID}#user-123`);
  assert.equal(items[0].Put.Item.pageId, 'https://example.com/x');
  assert.equal(items[0].Put.Item.voterSub, 'user-123');
  assert.match(items[0].Put.ConditionExpression, /attribute_not_exists/);
  // Item 1: the comment's voteCount, bumped only if the comment exists.
  assert.deepEqual(items[1].Update.Key, { pageId: 'https://example.com/x', commentId: SAMPLE_COMMENT_ID });
  assert.match(items[1].Update.UpdateExpression, /ADD voteCount :one/);
  assert.equal(items[1].Update.ExpressionAttributeValues[':one'], 1);
  assert.match(items[1].Update.ConditionExpression, /attribute_exists/);
});

test('POST .../vote is idempotent: re-casting the same vote succeeds and changes nothing (still one vote)', async () => {
  // The vote Put condition (item 0) fails because the voter already voted; the comment exists.
  ddbMock.on(TransactWriteCommand).rejects(transactionCanceled(['ConditionalCheckFailed', 'None']));
  const res = await handler(voteEvent({}));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test('POST .../vote on a non-existent comment is rejected (404), not a stub', async () => {
  // The vote Put would succeed (item 0 = None) but the count Update condition fails (item 1) — no comment.
  ddbMock.on(TransactWriteCommand).rejects(transactionCanceled(['None', 'ConditionalCheckFailed']));
  const res = await handler(voteEvent({}));
  assert.equal(res.statusCode, 404);
});

test('DELETE .../vote toggles the vote off: removes the vote item + decrements atomically', async () => {
  const res = await handler(voteEvent({ method: 'DELETE' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });

  const items = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems;
  assert.deepEqual(items[0].Delete.Key, { pageId: 'https://example.com/x', commentId: `VOTE#${SAMPLE_COMMENT_ID}#user-123` });
  assert.match(items[0].Delete.ConditionExpression, /attribute_exists/);
  assert.match(items[1].Update.UpdateExpression, /ADD voteCount :neg/);
  assert.equal(items[1].Update.ExpressionAttributeValues[':neg'], -1);
});

test('DELETE .../vote on a vote that was never cast is a no-op success (idempotent toggle-off)', async () => {
  // The Delete condition (item 0) fails — there's no vote to remove.
  ddbMock.on(TransactWriteCommand).rejects(transactionCanceled(['ConditionalCheckFailed', 'None']));
  const res = await handler(voteEvent({ method: 'DELETE' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test('a vote with no signed-in identity is rejected (401) and writes nothing', async () => {
  const res = await handler(voteEvent({ claims: {} }));
  assert.equal(res.statusCode, 401);
  assert.equal(ddbMock.commandCalls(TransactWriteCommand).length, 0);
});

test('a vote from an unverified-email identity is rejected (403)', async () => {
  const res = await handler(voteEvent({ claims: { sub: 'u', email_verified: 'false' } }));
  assert.equal(res.statusCode, 403);
  assert.equal(ddbMock.commandCalls(TransactWriteCommand).length, 0);
});

test('a vote with a non-http(s) pageUrl is rejected (400)', async () => {
  const res = await handler(voteEvent({ body: { pageUrl: 'chrome://newtab' } }));
  assert.equal(res.statusCode, 400);
  assert.equal(ddbMock.commandCalls(TransactWriteCommand).length, 0);
});

test('a vote re-normalizes the pageUrl defensively (does not trust the client)', async () => {
  await handler(voteEvent({ body: { pageUrl: 'https://Example.com/A/?utm_source=x#frag' } }));
  const items = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems;
  assert.equal(items[0].Put.Item.pageId, 'https://example.com/A');
  assert.equal(items[1].Update.Key.pageId, 'https://example.com/A');
});

test('every request logs the client version for telemetry (X-Client-Version, null when absent)', async () => {
  // A request carrying the header logs that version...
  await handler(getEvent({ pageUrl: 'https://e.com' }, { 'x-client-version': '0.2.0' }));
  assert.deepEqual(logs.at(-1), ['request', { route: 'GET /comments', clientVersion: '0.2.0' }]);

  // ...and one without it logs null — the old-client cohort we must be able to count.
  logs = [];
  await handler(postEvent({ body: { pageUrl: 'https://e.com', body: 'hi' } }));
  assert.deepEqual(logs.at(-1), ['request', { route: 'POST /comments', clientVersion: null }]);
});
