// Guards what ships: the package must contain every file the manifest references and must NOT
// contain dev/test tooling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHIP, clientDir } from '../scripts/build-zip.mjs';

const manifest = JSON.parse(readFileSync(resolve(clientDir, 'manifest.json'), 'utf8'));

test('the ship list excludes dev/test tooling', () => {
  for (const forbidden of ['test', 'dev', 'scripts', 'package.json', 'package-lock.json', 'node_modules', 'README.md']) {
    assert.ok(!SHIP.includes(forbidden), `${forbidden} must not ship`);
  }
});

test('every file the manifest references exists on disk', () => {
  const referenced = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
  ];
  for (const rel of referenced) {
    assert.ok(existsSync(resolve(clientDir, rel)), `manifest references missing file: ${rel}`);
  }
});

test('the shippable entry points exist', () => {
  for (const entry of SHIP) {
    assert.ok(existsSync(resolve(clientDir, entry)), `ship entry missing: ${entry}`);
  }
});
