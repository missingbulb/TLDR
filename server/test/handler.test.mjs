// Handler tests. DynamoDB is mocked at the AWS SDK boundary (aws-sdk-client-mock); all the
// handler logic — auth-claim checks, normalization, validation, rate-limit branch, projection,
// pagination — runs for real.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

process.env.TABLE_NAME = 'tldr-comments-test';
process.env.RATE_LIMIT_PER_MINUTE = '10';

const ddbMock = mockClient(DynamoDBDocumentClient);
const { handler } = await import('../src/handler.mjs');

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(UpdateCommand).resolves({});
  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(QueryCommand).resolves({ Items: [] });
});

const VALID_CLAIMS = { sub: 'user-123', name: 'Ada', email_verified: 'true' };

function postEvent({ claims = VALID_CLAIMS, body, isBase64Encoded = false } = {}) {
  return {
    requestContext: { http: { method: 'POST', path: '/comments' }, authorizer: { jwt: { claims } } },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded,
  };
}

function getEvent(queryStringParameters) {
  return { requestContext: { http: { method: 'GET', path: '/comments' } }, queryStringParameters };
}

function conditionalFailure() {
  return Object.assign(new Error('conditional check failed'), {
    name: 'ConditionalCheckFailedException',
  });
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

  const puts = ddbMock.commandCalls(PutCommand);
  assert.equal(puts.length, 1);
  const item = puts[0].args[0].input.Item;
  assert.equal(item.pageId, 'https://example.com/x');
  assert.equal(item.authorSub, 'user-123');
  assert.equal(item.body, 'hi');
  assert.equal(item.createdAt, comment.createdAt);
  assert.ok(!('authorEmail' in item), 'authorEmail must never be stored');
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

test('GET returns comments via the allowlist projection (no internal fields leak)', async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [
      {
        pageId: 'https://example.com/x',
        commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        authorSub: 'user-123',
        authorName: 'Ada',
        body: 'first!',
        createdAt: 1700000000000,
        pageUrlRaw: 'https://example.com/x?utm=1',
      },
    ],
    LastEvaluatedKey: { pageId: 'https://example.com/x', commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
  });

  const res = await handler(getEvent({ pageUrl: 'https://example.com/x' }));
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.comments.length, 1);
  const c = out.comments[0];
  assert.deepEqual(Object.keys(c).sort(), ['authorId', 'authorName', 'body', 'commentId', 'createdAt']);
  assert.equal(c.authorId, 'user-123');
  assert.ok(!('authorSub' in c) && !('pageUrlRaw' in c) && !('pageId' in c));
  assert.equal(typeof out.nextToken, 'string');

  const query = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
  assert.equal(query.ScanIndexForward, true);
  assert.ok(!('ConsistentRead' in query) || query.ConsistentRead !== true);
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
