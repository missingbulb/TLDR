// Tests for scripts/bump-patch-version.mjs — the daily auto-release's automated patch
// increment. Runs the real script as a child process against a throwaway fixture root, so the
// test exercises exactly what the workflow runs (arg handling, stdout contract, exit codes).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'bump-patch-version.mjs');

function fixtureRoot(manifestVersion, pkgVersion) {
  const root = mkdtempSync(join(tmpdir(), 'bump-'));
  mkdirSync(join(root, 'client'));
  writeFileSync(join(root, 'client', 'manifest.json'), `{\n  "name": "x",\n  "version": "${manifestVersion}"\n}\n`);
  writeFileSync(join(root, 'client', 'package.json'), `{\n  "name": "x",\n  "version": "${pkgVersion}"\n}\n`);
  return root;
}

test('bumps the patch component in both files and prints only the new version', () => {
  const root = fixtureRoot('1.2.3', '1.2.3');
  try {
    const out = execFileSync(process.execPath, [SCRIPT, root], { encoding: 'utf8' });
    assert.equal(out, '1.2.4\n');
    assert.equal(JSON.parse(readFileSync(join(root, 'client', 'manifest.json'), 'utf8')).version, '1.2.4');
    assert.equal(JSON.parse(readFileSync(join(root, 'client', 'package.json'), 'utf8')).version, '1.2.4');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails without writing when manifest and package.json disagree', () => {
  const root = fixtureRoot('1.2.3', '1.2.5');
  try {
    assert.throws(() => execFileSync(process.execPath, [SCRIPT, root], { encoding: 'utf8', stdio: 'pipe' }));
    assert.equal(JSON.parse(readFileSync(join(root, 'client', 'manifest.json'), 'utf8')).version, '1.2.3');
    assert.equal(JSON.parse(readFileSync(join(root, 'client', 'package.json'), 'utf8')).version, '1.2.5');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a non-X.Y.Z manifest version', () => {
  const root = fixtureRoot('1.2', '1.2');
  try {
    assert.throws(() => execFileSync(process.execPath, [SCRIPT, root], { encoding: 'utf8', stdio: 'pipe' }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
