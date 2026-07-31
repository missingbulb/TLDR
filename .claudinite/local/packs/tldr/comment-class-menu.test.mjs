// See-it-fail fixture for tldr/comment-class-menu: a line carrying anything
// beyond the class it names must produce exactly one finding, and every
// conforming shape must produce none.
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
  // Every class the classifier actually reads off the line is named back.
  for (const declared of ['correction', 'feature', 'process-change', 'other']) {
    assert.match(found[0].what, new RegExp(declared), `finding should name the declared class ${declared}`);
  }
});

// The three cases below are why this rule checks the form instead of hunting a
// negation word: each declares a class in plain prose, negating nothing, and an
// intent-inferring draft of this rule stayed silent on all three.

test('fires on a stray class smuggled in without negating anything', () => {
  const found = findingsFor('Comment class: other — unrelated to any feature request\n\nProceeding.');
  assert.equal(found.length, 1);
  assert.match(found[0].what, /feature/);
  // `feature` is the one that arms a BLOCKING rule, so the finding says so.
  assert.match(found[0].what, /feature-requirements-first/);
});

test('fires on a class named while being set aside', () => {
  const found = findingsFor('Comment class: other, setting the feature question to one side');
  assert.equal(found.length, 1);
  assert.match(found[0].what, /feature/);
});

test('fires on the menu pasted verbatim out of the prompt', () => {
  const found = findingsFor('Comment class: correction | feature | process-change | other');
  assert.equal(found.length, 1);
  // `|` is the menu's separator, never a declaration separator.
  assert.match(found[0].what, /correction/);
  assert.match(found[0].what, /feature/);
});

test('fires on an explanation sharing the line even when it smuggles no class', () => {
  const found = findingsFor('Comment class: correction — fixed the typo');
  assert.equal(found.length, 1);
  assert.match(found[0].what, /correction/);
  // Nothing armed a blocking rule here, so the finding does not claim otherwise.
  assert.doesNotMatch(found[0].what, /feature-requirements-first/);
});

test('silent on the class declared alone', () => {
  assert.deepEqual(findingsFor('Comment class: other\n\nNot a correction, feature request, or process-change — just a note.'), []);
});

test('silent on an honest multi-class declaration', () => {
  assert.deepEqual(findingsFor('Comment class: correction, process-change\n\nFixing it and updating the procedure.'), []);
});

test('silent on a multi-class declaration joined by "and"', () => {
  assert.deepEqual(findingsFor('Comment class: correction and process-change'), []);
});

test('silent on a trailing period', () => {
  assert.deepEqual(findingsFor('Comment class: other.'), []);
});

test('silent when there is no classification line at all (comment-classification owns that)', () => {
  assert.deepEqual(findingsFor('Sure, doing that now.'), []);
});

test('silent when the line names no known class at all (comment-classification owns that)', () => {
  assert.deepEqual(findingsFor('Comment class: misc'), []);
});
