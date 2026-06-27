import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getComments, postComment } from '../src/api.mjs';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('getComments builds a public GET (no Authorization header) with the pageUrl query', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return jsonResponse(200, { comments: [], nextToken: undefined });
  };
  await getComments('https://example.com/x', { fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/comments\?pageUrl=https%3A%2F%2Fexample\.com%2Fx$/);
  assert.equal(calls[0].opts.method, 'GET');
  assert.ok(!calls[0].opts.headers, 'reads must not send an Authorization header');
});

test('getComments passes a nextToken through', async () => {
  let seen;
  const fetchImpl = async (url) => { seen = url; return jsonResponse(200, {}); };
  await getComments('https://e.com', { fetchImpl, nextToken: 'TKN' });
  assert.match(seen, /nextToken=TKN/);
});

test('postComment attaches the bearer token and posts the body', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse(201, { comment: { commentId: 'x' } }); };
  const getIdToken = async () => 'ID_TOKEN';
  const out = await postComment('https://e.com/p', 'hello', getIdToken, { fetchImpl });
  assert.equal(out.comment.commentId, 'x');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer ID_TOKEN');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { pageUrl: 'https://e.com/p', body: 'hello' });
});

test('postComment refreshes the token once on a 401 and retries', async () => {
  let attempt = 0;
  const fetchImpl = async () => (attempt++ === 0 ? jsonResponse(401, {}) : jsonResponse(201, { comment: { commentId: 'y' } }));
  const tokenCalls = [];
  const getIdToken = async (opts) => { tokenCalls.push(opts); return 'T'; };
  const out = await postComment('https://e.com', 'hi', getIdToken, { fetchImpl });
  assert.equal(out.comment.commentId, 'y');
  assert.equal(attempt, 2);
  assert.equal(tokenCalls.length, 2);
  assert.deepEqual(tokenCalls[1], { forceRefresh: true });
});

test('postComment throws on a non-401 error', async () => {
  const fetchImpl = async () => jsonResponse(500, {});
  await assert.rejects(() => postComment('https://e.com', 'hi', async () => 'T', { fetchImpl }), /post failed: 500/);
});
