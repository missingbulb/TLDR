// Validates the shipped manifest is well-formed, MV3, least-privilege, and version-synced with
// package.json (the release workflow refuses to release if these disagree).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const extensionDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const manifest = JSON.parse(readFileSync(resolve(extensionDir, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(extensionDir, 'package.json'), 'utf8'));

test('manifest is MV3 with a valid X.Y.Z version', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test('manifest version matches package.json version', () => {
  assert.equal(manifest.version, pkg.version);
});

test('manifest declares the side panel, an ESM service worker, and icons', () => {
  assert.equal(manifest.side_panel.default_path, 'src/sidepanel.html');
  assert.equal(manifest.background.service_worker, 'src/service-worker.mjs');
  assert.equal(manifest.background.type, 'module');
  for (const size of ['16', '32', '48', '128']) {
    assert.ok(manifest.icons[size], `missing icon ${size}`);
  }
});

test('permissions are least-privilege', () => {
  const expected = ['identity', 'scripting', 'sidePanel', 'storage', 'tabs', 'webNavigation'];
  assert.deepEqual([...manifest.permissions].sort(), [...expected].sort());
  // No DEFAULT host access: the extension reaches the API via the server's '*' CORS (API Gateway v2
  // rejects the chrome-extension:// origin, so CORS is '*'), and launchWebAuthFlow uses a
  // browser-managed window — so no host_permissions is requested (not even the API host), and no
  // content_scripts are declared statically. "scripting" itself carries no install-time warning.
  assert.ok(!('host_permissions' in manifest), 'should request no ALWAYS-ON host_permissions');
  assert.ok(!('content_scripts' in manifest), 'the link-hover script is registered dynamically, never statically');
});

test('the link-hover preview host access is OPTIONAL (issue #26) — opt-in only, never granted at install', () => {
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
});
