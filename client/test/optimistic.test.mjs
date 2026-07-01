import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeOptimisticComment,
  mergeComments,
  reconcileSuccess,
  markFailed,
  applyVoteToggle,
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

test('mergeComments keeps server voteCount authoritative but preserves the local youVoted (server cannot know yours)', () => {
  // A refresh: the server returns the authoritative count (it now includes my vote) but no youVoted —
  // the public read is shared and cache-keyed without Authorization. The local copy carried youVoted.
  const server = [{ commentId: 'a', body: 'A', createdAt: 1, voteCount: 7 }];
  const local = [{ commentId: 'a', body: 'A', createdAt: 1, voteCount: 6, youVoted: true }];
  const [merged] = mergeComments(server, local);
  assert.equal(merged.voteCount, 7, 'server count wins');
  assert.equal(merged.youVoted, true, 'the local youVoted survives the refresh');
});

test('applyVoteToggle flips youVoted and moves the count ±1; it is self-inverse for rollback', () => {
  const before = [{ commentId: 'a', voteCount: 3, youVoted: false }, { commentId: 'b', voteCount: 1 }];
  const voted = applyVoteToggle(before, 'a', true);
  assert.deepEqual(voted[0], { commentId: 'a', voteCount: 4, youVoted: true });
  assert.deepEqual(voted[1], { commentId: 'b', voteCount: 1 }, 'other rows untouched');
  // Rolling back (the prior state) restores the exact count + flag.
  const rolledBack = applyVoteToggle(voted, 'a', false);
  assert.deepEqual(rolledBack[0], { commentId: 'a', voteCount: 3, youVoted: false });
});

test('applyVoteToggle never drives a count below zero, and no-ops a list without the comment', () => {
  assert.deepEqual(applyVoteToggle([{ commentId: 'a' }], 'a', false), [{ commentId: 'a', voteCount: 0, youVoted: false }]);
  const list = [{ commentId: 'x', voteCount: 2 }];
  assert.deepEqual(applyVoteToggle(list, 'absent', true), list, 'a list missing the comment is unchanged');
});
