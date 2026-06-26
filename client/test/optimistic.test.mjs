import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeOptimisticComment,
  mergeComments,
  reconcileSuccess,
  markFailed,
} from '../src/optimistic.mjs';

test('makeOptimisticComment marks the entry pending under its temp id', () => {
  const c = makeOptimisticComment({ tempId: 'temp-1', body: 'hi', authorName: 'Ada', authorId: 'u1', createdAt: 5 });
  assert.equal(c.commentId, 'temp-1');
  assert.equal(c.pending, true);
  assert.equal(c.body, 'hi');
});

test('mergeComments dedupes by commentId (server wins) and sorts by createdAt', () => {
  const server = [
    { commentId: 'a', body: 'A', createdAt: 1 },
    { commentId: 'b', body: 'B', createdAt: 3 },
  ];
  const local = [
    { commentId: 'b', body: 'B-local', createdAt: 3, pending: true }, // superseded by server 'b'
    { commentId: 'temp-1', body: 'pending', createdAt: 2, pending: true }, // local-only, kept
  ];
  const merged = mergeComments(server, local);
  assert.deepEqual(merged.map((c) => c.commentId), ['a', 'temp-1', 'b']);
  assert.equal(merged.find((c) => c.commentId === 'b').pending, undefined); // server record, no pending flag
  assert.equal(merged.find((c) => c.commentId === 'temp-1').pending, true);
});

test('reconcileSuccess swaps the temp entry for the authoritative server record', () => {
  const local = [makeOptimisticComment({ tempId: 'temp-1', body: 'hi', authorName: 'Ada', authorId: 'u1', createdAt: 9 })];
  const authoritative = { commentId: '01REAL', body: 'hi', authorName: 'Ada', authorId: 'u1', createdAt: 10 };
  const next = reconcileSuccess(local, 'temp-1', authoritative);
  assert.equal(next.length, 1);
  assert.equal(next[0].commentId, '01REAL');
  assert.equal(next[0].pending, false);
});

test('markFailed flags the temp entry for a retry affordance', () => {
  const local = [makeOptimisticComment({ tempId: 'temp-1', body: 'hi', authorName: 'Ada', authorId: 'u1', createdAt: 9 })];
  const next = markFailed(local, 'temp-1');
  assert.equal(next[0].failed, true);
  assert.equal(next[0].pending, false);
});
