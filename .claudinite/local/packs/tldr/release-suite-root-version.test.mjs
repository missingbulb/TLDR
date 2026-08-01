// See-it-fail fixture for tldr/release-suite-root-version: a test file the
// release config's `test_command` runs must produce exactly one finding when it
// reads the repo-root package.json for a version, and none when it reads the
// extension's own package.json, or when it sits outside the release suite.
//
// The fixture drives the rule through the engine's own dispatch seam (runRule +
// buildContext over a real throwaway git repo), not by hand-rolling a context —
// so the test proves the rule as the conformance sweep actually runs it, glob
// resolution and all.
//
// Run it directly (no npm script owns .claudinite/local/packs):
//   node --test .claudinite/local/packs/tldr/release-suite-root-version.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import rule from './release-suite-root-version.mjs';
import { buildContext } from '../../../shared/engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../shared/engine/checks/helpers/work.mjs';

// This repo's real release wiring: the bump moves the two extension paths, then
// runs the root suite and the extension suite.
const RELEASE_CONFIG = [
  'manifest_path=extension/manifest.json',
  'package_json_path=extension/package.json',
  'test_command=npm test && npm --prefix extension test',
  'ship_paths=extension/manifest.json extension/src',
  '',
].join('\n');

const ROOT_PKG = JSON.stringify({
  version: '0.2.7',
  scripts: { test: 'node --test "shared/test/**/*.test.mjs"' },
});
const EXTENSION_PKG = JSON.stringify({
  version: '0.2.7',
  scripts: { test: 'node --test "../extension-test/**/*.test.mjs"' },
});
const DEV_PKG = JSON.stringify({
  scripts: { test: 'node --test "requirements/**/*.test.mjs"' },
});

// A test file shaped exactly like the real extension-test/manifest.test.mjs:
// the manifest and the extension's own package.json reached through a `const`
// that names the extension directory.
const CLEAN_SUITE_FILE = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const extensionDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const manifest = JSON.parse(readFileSync(resolve(extensionDir, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(extensionDir, 'package.json'), 'utf8'));

test('manifest version matches package.json version', () => {
  assert.equal(manifest.version, pkg.version);
});
`;

// The trap: the same file, "closing the loop" on the recurring cer/version-sync
// drift by asserting the ROOT package.json the bump never moves.
const ROOT_VERSION_ASSERTION = `
const rootPkg = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));

test('manifest version matches the repo-root package.json version', () => {
  assert.equal(manifest.version, rootPkg.version);
});
`;

function repoWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'tldr-release-suite-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  spawnSync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

const findingsFor = (files) =>
  runRule(rule, buildContext({ root: repoWith(files), mode: 'all' }));

const baseRepo = (extra = {}) => ({
  '.github/release.config': RELEASE_CONFIG,
  'package.json': ROOT_PKG,
  'extension/package.json': EXTENSION_PKG,
  'extension/manifest.json': JSON.stringify({ version: '0.2.7' }),
  'extension-test/manifest.test.mjs': CLEAN_SUITE_FILE,
  ...extra,
});

test('fires on a release-suite test asserting the repo-root package.json version', () => {
  const found = findingsFor(baseRepo({
    'extension-test/manifest.test.mjs': CLEAN_SUITE_FILE + ROOT_VERSION_ASSERTION,
  }));
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'tldr/release-suite-root-version');
  assert.equal(found[0].severity, 'blocking');
  assert.equal(found[0].file, 'extension-test/manifest.test.mjs');
  // The remedy names where the loop is actually closed.
  assert.match(found[0].fix, /release\.config/);
});

test('fires on the joined-literal spelling of the same read', () => {
  const found = findingsFor(baseRepo({
    'extension-test/packaging.test.mjs': `import { readFileSync } from 'node:fs';
const rootPkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
test('version', () => { assert.ok(rootPkg.version); });
`,
  }));
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'extension-test/packaging.test.mjs');
});

test('fires on a root-suite test file too, not just the extension suite', () => {
  const found = findingsFor(baseRepo({
    'shared/test/version.test.mjs': `import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const pkg = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8'));
test('version is semver', () => { assert.match(pkg.version, /^\\d+\\.\\d+\\.\\d+$/); });
`,
  }));
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'shared/test/version.test.mjs');
});

test('silent on the real suite, which reads the extension package.json through a directory const', () => {
  assert.deepEqual(findingsFor(baseRepo()), []);
});

test('silent outside the release suite — a dev suite may read the root package.json', () => {
  assert.deepEqual(findingsFor(baseRepo({
    'dev/package.json': DEV_PKG,
    'dev/requirements/version.test.mjs': `import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const pkg = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8'));
test('version is semver', () => { assert.match(pkg.version, /^\\d+\\.\\d+\\.\\d+$/); });
`,
  })), []);
});

test('silent when a release-suite file reads the root package.json for something other than a version', () => {
  assert.deepEqual(findingsFor(baseRepo({
    'extension-test/name.test.mjs': `import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const pkg = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
test('the workspace is private', () => { assert.equal(pkg.private, true); });
`,
  })), []);
});

test('silent when the repo declares no release config', () => {
  const files = baseRepo({
    'extension-test/manifest.test.mjs': CLEAN_SUITE_FILE + ROOT_VERSION_ASSERTION,
  });
  delete files['.github/release.config'];
  assert.deepEqual(findingsFor(files), []);
});
