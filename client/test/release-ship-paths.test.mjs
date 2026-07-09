// Drift guard: the release config's `ship_paths` must match the extension's real
// shipping set. The daily auto-release (Claudinite canon) decides "did a
// deployable file change?" by a prefix match against `ship_paths` in the repo's
// .github/release.config; the zip's actual contents come from build-zip.mjs's
// SHIP list. If those two drift apart, the daily release either misses a shipped
// change or fires on a non-shipped one. This test pins them together — the same
// role client/test/filter-shipped-paths.test.mjs used to play for the per-repo
// filter script that the canon replaced.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { SHIP } from '../../dev/build/tools/build-zip.mjs';

// client/test/ -> repo root -> .github/release.config
const CONFIG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../.github/release.config');

function readShipPaths() {
  const text = readFileSync(CONFIG_PATH, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() === 'ship_paths') {
      return line.slice(eq + 1).trim().split(/\s+/).filter(Boolean);
    }
  }
  return null;
}

test('release.config ship_paths matches the build SHIP list (both prefixed with client/)', () => {
  const shipPaths = readShipPaths();
  assert.ok(shipPaths, 'ship_paths must be set in .github/release.config');
  const expected = SHIP.map((entry) => `client/${entry}`);
  // Order-independent: the daily filter is a set-membership check.
  assert.deepEqual([...shipPaths].sort(), [...expected].sort(),
    'ship_paths drifted from build-zip.mjs SHIP — update .github/release.config to match what the zip ships');
});
