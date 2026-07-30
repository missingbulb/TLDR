import { test } from 'node:test';
import assert from 'node:assert/strict';
import { work } from '../../../shared/engine/checks/helpers/work.mjs';
import rule from './comment-class-single-line.mjs';

const ctxWithEntries = (entries) => ({ conversation: () => entries });

const ownerTurn = (text) => ({
  type: 'user',
  timestamp: '2026-01-01T00:00:00Z',
  message: { content: text },
});

const assistantText = (text) => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
});

test('fires when the classification line names more than one class', () => {
  const entries = [
    ownerTurn('please fix the bug'),
    assistantText('Comment class: other — not a correction, feature request, or process-change\n\nDone.'),
  ];
  const findings = rule.run(work(ctxWithEntries(entries)));
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /names 4 classes/);
});

test('stays quiet when the classification line names exactly one class', () => {
  const entries = [
    ownerTurn('please fix the bug'),
    assistantText('Comment class: other\n\nNot a correction, feature request, or process-change.'),
  ];
  const findings = rule.run(work(ctxWithEntries(entries)));
  assert.equal(findings.length, 0);
});

test('stays quiet when the reply carries no classification line at all', () => {
  const entries = [
    ownerTurn('please fix the bug'),
    assistantText('Done, nothing further needed here.'),
  ];
  const findings = rule.run(work(ctxWithEntries(entries)));
  assert.equal(findings.length, 0);
});

test('stays quiet when there is no owner turn', () => {
  const findings = rule.run(work(ctxWithEntries([])));
  assert.equal(findings.length, 0);
});
