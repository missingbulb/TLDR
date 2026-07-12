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

// The link-hover content script is a CLASSIC boot shim (src/link-hover-boot.mjs) that dynamic-imports
// the real ES module (src/link-hover.mjs). Chrome will only serve that module — and every module it
// transitively imports — to the injected context if each is listed in web_accessible_resources; a
// missing entry fails ONLY at runtime on a real page ("Denying load of chrome-extension://…"), never in
// a unit test. So walk link-hover.mjs's actual static-import graph and assert the manifest covers it —
// this is the guard for the bug class where adding an import silently breaks hover loading.
function importGraph(entryRelPath) {
  const seen = new Set();
  const walk = (relPath) => {
    if (seen.has(relPath)) return;
    seen.add(relPath);
    const src = readFileSync(resolve(extensionDir, relPath), 'utf8');
    const dir = dirname(relPath);
    // Static `import … from './x'` / `export … from './x'` — only RELATIVE specifiers point at our
    // own shippable files (bare specifiers would be a bug this repo doesn't have).
    for (const m of src.matchAll(/(?:import|export)\b[^;]*?\bfrom\s+['"](\.[^'"]+)['"]/g)) {
      const child = resolve(dir, m[1]).slice(extensionDir.length + 1).split('\\').join('/');
      walk(child);
    }
  };
  walk(entryRelPath);
  return seen;
}

test('web_accessible_resources covers the entire link-hover module import graph (issue #26)', () => {
  const war = manifest.web_accessible_resources;
  assert.ok(Array.isArray(war) && war.length >= 1, 'web_accessible_resources must be declared for the hover module');
  const exposed = new Set(war.flatMap((entry) => entry.resources ?? []));

  const graph = importGraph('src/link-hover.mjs');
  for (const file of graph) {
    assert.ok(exposed.has(file), `hover import-graph file not web-accessible (hover will fail to load): ${file}`);
  }

  // The graph must reach the shared deps we know it depends on — a cheap sanity check that the walker
  // actually traversed (not that it silently found an empty graph and vacuously passed).
  for (const known of ['src/link-hover.mjs', 'src/hover-tooltip.mjs', 'vendor/categories.GENERATED.mjs']) {
    assert.ok(graph.has(known), `import-graph walk should include ${known}`);
  }

  // Every WAR entry must be reachable by the hover script on the pages it runs on (http/https).
  for (const entry of war) {
    assert.deepEqual([...(entry.matches ?? [])].sort(), ['http://*/*', 'https://*/*']);
  }
});
