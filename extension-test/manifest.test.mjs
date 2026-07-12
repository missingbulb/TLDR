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

// A registered content script is injected as a CLASSIC script — Chrome has no module mode for one — so
// the injected file (link-hover-loader.mjs) can't carry top-level `import`s, and the real ES module it
// dynamic-imports (link-hover.mjs) plus its WHOLE transitive import graph must be web-accessible for the
// page to fetch them via chrome.runtime.getURL. These two tests pin exactly that contract: without them,
// the feature silently no-ops (the toggle registers, but the injected import throws in the host page).

const HOVER_MODULE_ENTRY = 'src/link-hover.mjs';

// Resolve every LOCAL module reachable from `entry` by following its static imports, as paths relative
// to extension/ (the web_accessible_resources namespace). Bare specifiers (none exist in this graph)
// are ignored; only same-package .mjs files matter for WAR.
function reachableModules(entry) {
  const seen = new Set();
  const queue = [entry];
  const IMPORT_RE = /import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const source = readFileSync(resolve(extensionDir, rel), 'utf8');
    const dir = dirname(rel);
    for (const m of source.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue; // a bare specifier — not a packaged file
      // Normalize the relative import to an extension/-relative POSIX path.
      const target = resolve('/' + dir, spec).slice(1);
      if (target.endsWith('.mjs')) queue.push(target);
    }
  }
  return seen;
}

test('the link-hover loader (the injected classic script) carries no top-level static import/export', () => {
  const loader = readFileSync(resolve(extensionDir, 'src/link-hover-loader.mjs'), 'utf8');
  // A classic content script must not use module syntax; only the dynamic import() form is allowed.
  assert.doesNotMatch(loader, /^\s*import\s+[^(]/m, 'no top-level `import … from`/`import "…"` — use dynamic import()');
  assert.doesNotMatch(loader, /^\s*export\s/m, 'a classic content script has no exports');
  assert.match(loader, /import\(/, 'the loader must dynamic-import the real module');
});

test("web_accessible_resources exposes link-hover.mjs and its ENTIRE import graph over the hover origins", () => {
  const war = manifest.web_accessible_resources;
  assert.ok(Array.isArray(war) && war.length === 1, 'exactly one web_accessible_resources entry');
  assert.deepEqual([...war[0].matches].sort(), ['http://*/*', 'https://*/*'], 'gated to the hover origins');

  const exposed = new Set(war[0].resources);
  // Every module the dynamically-imported entry can reach must be fetchable by the page, or the import
  // chain breaks at the first missing file. Walk the real graph so this can't drift as imports change.
  const required = reachableModules(HOVER_MODULE_ENTRY);
  const missing = [...required].filter((m) => !exposed.has(m));
  assert.deepEqual(missing, [], 'link-hover modules reachable-but-not-web-accessible');
});
