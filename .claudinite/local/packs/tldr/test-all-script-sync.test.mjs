// See-it-fail fixture for the sharedConstants entry that keeps RULES.md's
// documented `test:all` command byte-identical with package.json's real script
// (.claudinite-settings.json's "sharedConstants" array, enforced by the basics
// pack's generic `shared-constants` world check).
//
// Run it directly (no npm script owns .claudinite/local/packs):
//   node --test .claudinite/local/packs/tldr/test-all-script-sync.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import rule from '../../../shared/packs/basics/worldRules/shared-constants.mjs';
import { loadConfig } from '../../../shared/engine/checks/helpers/repo-context.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PACKAGE_JSON = 'package.json';
const RULES_MD = '.claudinite/local/packs/tldr/RULES.md';

const entry = loadConfig(repoRoot).sharedConstants.find((e) => e.what.includes('test:all'));

function ctxServing(files) {
  return { config: { sharedConstants: [entry] }, read: (path) => files[path] ?? null };
}

test('silent when package.json and RULES.md carry the real, matching text', () => {
  const files = {
    [PACKAGE_JSON]: readFileSync(join(repoRoot, PACKAGE_JSON), 'utf8'),
    [RULES_MD]: readFileSync(join(repoRoot, RULES_MD), 'utf8'),
  };
  assert.deepEqual(rule.run(ctxServing(files)), []);
});

test('fires when RULES.md drifts from package.json\'s script', () => {
  const files = {
    [PACKAGE_JSON]: readFileSync(join(repoRoot, PACKAGE_JSON), 'utf8'),
    [RULES_MD]: '`test:all` is `npm test && npm --prefix server ci && npm --prefix server test`.',
  };
  const findings = rule.run(ctxServing(files));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocking');
  assert.equal(findings[0].file, RULES_MD);
});

test('fires when package.json drops a sub-suite the docs still claim', () => {
  const files = {
    [PACKAGE_JSON]: JSON.stringify({ scripts: { 'test:all': 'npm test' } }),
    [RULES_MD]: readFileSync(join(repoRoot, RULES_MD), 'utf8'),
  };
  const findings = rule.run(ctxServing(files));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocking');
  assert.equal(findings[0].file, PACKAGE_JSON);
});
