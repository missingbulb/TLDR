// See-it-fail fixture for tldr/version-drift-direction: a change that moves
// extension/manifest.json's version DOWN, or moves the root package.json's
// version to anything other than the shipped one, must find — and every correct
// direction (and every change that leaves both fields alone) must stay silent.
//
// The fixture drives the rule through the engine's own dispatch seam (runRule +
// buildContext), not by hand-rolling a work object, so the test proves the rule
// as the Stop hook actually runs it. Because this is a delta rule, each case is
// a throwaway git repo with a real merge-base: base state committed on `main`,
// head state committed on a branch off it — which is what makes `readBase()`
// (and therefore `jsonPair`) answer.
//
// Run it directly (no npm script owns .claudinite/local/packs):
//   node --test .claudinite/local/packs/tldr/version-drift-direction.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import rule from './version-drift-direction.mjs';
import { buildContext } from '../../../shared/engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../shared/engine/checks/helpers/work.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });

// One state of the two version records. `manifest: null` means the file does not
// exist at all in that state.
function writeState(dir, { manifest, root }) {
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'tldr', version: root }, null, 2)}\n`);
  if (manifest !== null) {
    mkdirSync(join(dir, 'extension'), { recursive: true });
    writeFileSync(join(dir, 'extension', 'manifest.json'), `${JSON.stringify({ manifest_version: 3, version: manifest }, null, 2)}\n`);
  }
}

function commit(dir, message) {
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-q', '--allow-empty', '-m', message);
}

// A repo whose merge-base carries `base` and whose branch head carries `head`.
function findingsFor(base, head) {
  const dir = mkdtempSync(join(tmpdir(), 'tldr-version-drift-'));
  git(dir, 'init', '-q', '-b', 'main');
  writeState(dir, base);
  commit(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'work');
  writeState(dir, head);
  commit(dir, 'the change under test');
  return runRule(rule, buildContext({ root: dir, mode: 'changed' }));
}

test('fires when the manifest is edited DOWN to the stale root version', () => {
  const found = findingsFor(
    { manifest: '1.4.7', root: '1.4.2' },
    { manifest: '1.4.2', root: '1.4.2' },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'tldr/version-drift-direction');
  assert.equal(found[0].severity, 'blocking');
  assert.equal(found[0].file, 'extension/manifest.json');
  assert.match(found[0].what, /1\.4\.7 -> 1\.4\.2/);
  // The remedy names the version to restore, not just the direction.
  assert.match(found[0].fix, /1\.4\.7/);
});

test('fires when the root package.json is bumped PAST the shipped version', () => {
  const found = findingsFor(
    { manifest: '1.4.7', root: '1.4.6' },
    { manifest: '1.4.7', root: '1.4.8' },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'package.json');
  assert.match(found[0].what, /1\.4\.6 -> 1\.4\.8/);
  assert.match(found[0].what, /1\.4\.7/);
  assert.match(found[0].fix, /1\.4\.7/);
});

test('fires twice when both records are moved the wrong way at once', () => {
  const found = findingsFor(
    { manifest: '1.4.7', root: '1.4.2' },
    { manifest: '1.4.5', root: '1.4.4' },
  );
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((f) => f.file).sort(), ['extension/manifest.json', 'package.json']);
});

test('silent on the correct correction — the root aligned UP to the manifest', () => {
  assert.deepEqual(findingsFor(
    { manifest: '1.4.7', root: '1.4.2' },
    { manifest: '1.4.7', root: '1.4.7' },
  ), []);
});

test('silent on a real release bump that moves both records up together', () => {
  assert.deepEqual(findingsFor(
    { manifest: '1.4.7', root: '1.4.7' },
    { manifest: '1.5.0', root: '1.5.0' },
  ), []);
});

test('silent on the auto-release bump, which moves the manifest and leaves the root behind', () => {
  assert.deepEqual(findingsFor(
    { manifest: '1.4.7', root: '1.4.7' },
    { manifest: '1.4.8', root: '1.4.7' },
  ), []);
});

test('silent when the change touches neither version field (the standing drift is cer/version-sync to report)', () => {
  assert.deepEqual(findingsFor(
    { manifest: '1.4.7', root: '1.4.2' },
    { manifest: '1.4.7', root: '1.4.2' },
  ), []);
});

test('silent in a repo with no extension manifest at all', () => {
  assert.deepEqual(findingsFor(
    { manifest: null, root: '1.4.2' },
    { manifest: null, root: '1.4.3' },
  ), []);
});
