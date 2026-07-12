import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getComments, postComment, castVote, removeVote, getTopComment } from '../extension/src/api.mjs';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('getComments builds a public GET (no Authorization) with the pageUrl query and the client-version header', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return jsonResponse(200, { comments: [], nextToken: undefined });
  };
  await getComments('https://example.com/x', { fetchImpl, clientVersion: '1.2.3' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/comments\?pageUrl=https%3A%2F%2Fexample\.com%2Fx$/);
  assert.equal(calls[0].opts.method, 'GET');
  // The version is telemetry, not auth — the read stays anonymous (no bearer), but does carry the version.
  assert.ok(!('authorization' in (calls[0].opts.headers || {})), 'reads must not send an Authorization header');
  assert.equal(calls[0].opts.headers['x-client-version'], '1.2.3');
});

test('getComments omits the version header when no version is supplied', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse(200, {}); };
  await getComments('https://example.com/x', { fetchImpl });
  assert.ok(!calls[0].opts.headers || !('x-client-version' in calls[0].opts.headers));
});

test('getComments passes a nextToken through', async () => {
  let seen;
  const fetchImpl = async (url) => { seen = url; return jsonResponse(200, {}); };
  await getComments('https://e.com', { fetchImpl, nextToken: 'TKN' });
  assert.match(seen, /nextToken=TKN/);
});

test('postComment attaches the bearer token, the client-version header, and posts the body', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse(201, { comment: { commentId: 'x' } }); };
  const getIdToken = async () => 'ID_TOKEN';
  const out = await postComment('https://e.com/p', 'hello', getIdToken, { fetchImpl, clientVersion: '1.2.3' });
  assert.equal(out.comment.commentId, 'x');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer ID_TOKEN');
  assert.equal(calls[0].opts.headers['x-client-version'], '1.2.3');
  // The version is a header — the wire body is unchanged (additive evolution, never reshaped).
  assert.deepEqual(JSON.parse(calls[0].opts.body), { pageUrl: 'https://e.com/p', body: 'hello' });
});

test('postComment includes the selected category in the body when one is provided', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse(201, { comment: { commentId: 'x' } }); };
  await postComment('https://e.com/p', 'hello', async () => 'T', { fetchImpl, category: 'spoiler' });
  assert.deepEqual(JSON.parse(calls[0].opts.body), { pageUrl: 'https://e.com/p', body: 'hello', category: 'spoiler' });
});

test('postComment omits category from the body when none is provided (older-client shape unchanged)', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse(201, { comment: { commentId: 'x' } }); };
  await postComment('https://e.com/p', 'hello', async () => 'T', { fetchImpl });
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
  // First send is silent-only; the 401 retry is the one place a visible prompt is permitted.
  assert.deepEqual(tokenCalls[0], { interactive: false });
  assert.deepEqual(tokenCalls[1], { forceRefresh: true, interactive: true });
});

test('postComment throws on a non-401 error', async () => {
  const fetchImpl = async () => jsonResponse(500, {});
  await assert.rejects(() => postComment('https://e.com', 'hi', async () => 'T', { fetchImpl }), /post failed: 500/);
});

test('castVote does an authenticated POST to /comments/<id>/vote with pageUrl in the body and the version header', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse(200, { ok: true }); };
  await castVote('https://e.com/p', '01ABC', async () => 'ID_TOKEN', { fetchImpl, clientVersion: '1.2.3' });
  assert.match(calls[0].url, /\/comments\/01ABC\/vote$/);
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer ID_TOKEN');
  assert.equal(calls[0].opts.headers['x-client-version'], '1.2.3');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { pageUrl: 'https://e.com/p' });
});

test('removeVote does an authenticated DELETE to the same vote path', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse(200, { ok: true }); };
  await removeVote('https://e.com/p', '01ABC', async () => 'T', { fetchImpl });
  assert.equal(calls[0].opts.method, 'DELETE');
  assert.match(calls[0].url, /\/comments\/01ABC\/vote$/);
});

test('a commentId with URL-significant characters is percent-encoded into the path', async () => {
  let seen;
  const fetchImpl = async (url) => { seen = url; return jsonResponse(200, { ok: true }); };
  await castVote('https://e.com', 'a/b#c', async () => 'T', { fetchImpl });
  assert.match(seen, /\/comments\/a%2Fb%23c\/vote$/);
});

test('castVote refreshes the token once on a 401 and retries (silent first, interactive on retry)', async () => {
  let attempt = 0;
  const fetchImpl = async () => (attempt++ === 0 ? jsonResponse(401, {}) : jsonResponse(200, { ok: true }));
  const tokenCalls = [];
  const getIdToken = async (opts) => { tokenCalls.push(opts); return 'T'; };
  await castVote('https://e.com', '01ABC', getIdToken, { fetchImpl });
  assert.equal(attempt, 2);
  assert.deepEqual(tokenCalls[0], { interactive: false });
  assert.deepEqual(tokenCalls[1], { forceRefresh: true, interactive: true });
});

test('a vote throws on a non-401 error so the panel can roll back', async () => {
  const fetchImpl = async () => jsonResponse(500, {});
  await assert.rejects(() => castVote('https://e.com', '01ABC', async () => 'T', { fetchImpl }), /vote failed: 500/);
});

test('getTopComment builds a public GET (no Authorization) to /comments/top with pageUrl + category', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse(200, { comment: null }); };
  await getTopComment('https://example.com/x', 'tldr', { fetchImpl, clientVersion: '1.2.3' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/comments\/top\?pageUrl=https%3A%2F%2Fexample\.com%2Fx&category=tldr$/);
  assert.equal(calls[0].opts.method, 'GET');
  assert.ok(!('authorization' in (calls[0].opts.headers || {})), 'reads must not send an Authorization header');
  assert.equal(calls[0].opts.headers['x-client-version'], '1.2.3');
});

test('getTopComment omits the category querystring when none is supplied', async () => {
  let seen;
  const fetchImpl = async (url) => { seen = url; return jsonResponse(200, { comment: null }); };
  await getTopComment('https://e.com', undefined, { fetchImpl });
  assert.doesNotMatch(seen, /category=/);
});

test('getTopComment resolves the { comment: null } empty-state shape as a success, not a throw', async () => {
  const fetchImpl = async () => jsonResponse(200, { comment: null });
  const out = await getTopComment('https://e.com', 'tldr', { fetchImpl });
  assert.deepEqual(out, { comment: null });
});

test('getTopComment throws on a non-2xx response', async () => {
  const fetchImpl = async () => jsonResponse(400, { message: 'unknown category' });
  await assert.rejects(() => getTopComment('https://e.com', 'bogus', { fetchImpl }), /top-comment read failed: 400/);
});
