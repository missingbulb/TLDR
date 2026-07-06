// Tests for scripts/filter-shipped-paths.mjs — the daily auto-release's "did anything
// deployable change?" gate. Runs the real script as a child process (stdin -> stdout), the same
// way the workflow pipes `git diff --name-only` through it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'filter-shipped-paths.mjs');

const run = (input) => execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', input });

test('keeps only paths inside the shipped set', () => {
  const out = run(
    [
      'client/manifest.json',
      'client/config.mjs',
      'client/src/sidepanel.mjs',
      'client/vendor/normalizeUrl.GENERATED.mjs',
      'client/icons/icon16.png',
      'client/test/api.test.mjs',
      'client/scripts/build-zip.mjs',
      'client/README.md',
      'dev/docs/architecture.md',
      'server/src/handler.mjs',
      '.github/workflows/release.yml',
    ].join('\n'),
  );
  assert.deepEqual(out.split('\n').filter(Boolean), [
    'client/manifest.json',
    'client/config.mjs',
    'client/src/sidepanel.mjs',
    'client/vendor/normalizeUrl.GENERATED.mjs',
    'client/icons/icon16.png',
  ]);
});

test('a prefix look-alike outside the shipped dirs does not match', () => {
  assert.equal(run('client/srcery.mjs\nclient/iconset/x.png\n'), '');
});

test('empty input produces empty output and exit 0', () => {
  assert.equal(run(''), '');
});
