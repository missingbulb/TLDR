// See-it-fail fixture for tldr/comment-class-menu: a violating transcript must
// produce exactly one finding, and every clean shape must produce none.
//
// The fixture drives the rule through the engine's own dispatch seam (runRule +
// buildContext with a transcript path), not by hand-rolling a work object — so
// the test proves the rule as the Stop hook actually runs it.
//
// Run it directly (no npm script owns .claudinite/local/packs):
//   node --test .claudinite/local/packs/tldr/comment-class-menu.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import rule from './comment-class-menu.mjs';
import { buildContext } from '../../../shared/engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../shared/engine/checks/helpers/work.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'tldr-comment-class-'));

// A minimal Claude Code transcript: one owner turn, then the assistant reply
// whose classification line is under test. These are the shapes
// session-transcript.mjs reads (a plain-string user message, an assistant
// content array of text blocks).
function transcriptWith(replyText) {
  const entries = [
    { type: 'user', timestamp: '2026-07-31T00:00:00Z', message: { role: 'user', content: 'please look at the release job' } },
    { type: 'assistant', timestamp: '2026-07-31T00:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: replyText }] } },
  ];
  const path = join(scratch, `t-${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(path, `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return path;
}

const findingsFor = (replyText) =>
  runRule(rule, buildContext({ root: repoRoot, mode: 'changed', transcriptPath: transcriptWith(replyText) }));

test('fires on the menu-restating line that poisoned the 2026-07-26 sessions', () => {
  const found = findingsFor('Comment class: other — not a correction, feature request, or process-change\n\nOn it.');
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'tldr/comment-class-menu');
  assert.equal(found[0].severity, 'advisory');
  // The stray classes are named so the session can see what it actually declared.
  for (const stray of ['correction', 'feature', 'process-change']) {
    assert.match(found[0].what, new RegExp(stray), `finding should name the stray class ${stray}`);
  }
});

test('fires on a single stray class smuggled in behind a negation', () => {
  const found = findingsFor('Comment class: other (no feature work here)\n\nProceeding.');
  assert.equal(found.length, 1);
  assert.match(found[0].what, /feature/);
});

test('silent on the class declared alone', () => {
  assert.deepEqual(findingsFor('Comment class: other\n\nNot a correction, feature request, or process-change — just a note.'), []);
});

test('silent on an honest multi-class declaration', () => {
  assert.deepEqual(findingsFor('Comment class: correction, process-change\n\nFixing it and updating the procedure.'), []);
});

test('silent when a negation follows the classes it does not name', () => {
  assert.deepEqual(findingsFor('Comment class: correction, process-change — the ask was not clear at first'), []);
});

test('silent when a class named after a negation was already declared before it', () => {
  assert.deepEqual(findingsFor('Comment class: correction — a correction of the docs, not a correction of code'), []);
});

test('silent when there is no classification line at all (comment-classification owns that)', () => {
  assert.deepEqual(findingsFor('Sure, doing that now.'), []);
});
