// See-it-fail fixture for tldr/release-root-version-align.
//
// The two fixtures are the real files, not hand-written YAML: the repo's own
// committed workflow (which carries #241's align step) must stay silent, and the
// canon stub the `chrome-release-vendoring` materialize would overwrite it with
// must fire exactly one finding. That is the regression this rule exists for, so
// the fixture is only honest if it is that exact byte sequence.
//
// Run it directly (no npm script owns .claudinite/local/packs):
//   node --test .claudinite/local/packs/tldr/release-root-version-align.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import rule from './release-root-version-align.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WORKFLOW = '.github/workflows/chrome-extension-bump-version.yml';
const STUB = '.claudinite/shared/packs/chrome-extension/stubs/workflows/chrome-extension-bump-version.yml';

// A minimal world context: the rule reads exactly one path.
const ctxServing = (text) => ({ read: (path) => (path === WORKFLOW ? text : null) });
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');

test('silent on the repo\'s committed workflow, which carries the align step', () => {
  assert.deepEqual(rule.run(ctxServing(read(WORKFLOW))), []);
});

test('fires on the canon stub — the exact content a materialize would write', () => {
  const findings = rule.run(ctxServing(read(STUB)));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocking');
  assert.equal(findings[0].file, WORKFLOW);
  assert.match(findings[0].fix, /#245/);
});

test('silent when the workflow is absent — that is cer/release-workflows\' finding', () => {
  assert.deepEqual(rule.run({ read: () => null }), []);
});
