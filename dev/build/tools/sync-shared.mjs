// Copies each canonical shared/*.mjs module VERBATIM into the vendored locations that can't import
// across the repo at runtime. Run after editing any shared module (normalizeUrl.mjs, categories.mjs).
//
// The copies are byte-identical to their source (the GENERATED marker lives in the filename), so
// dev/build/tools/test/shared-drift.test.mjs can guard drift with a simple byte-equality check.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This tool lives at dev/build/tools/, so the repo root is three levels up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Each canonical shared module and the vendored copies it fans out to (server + client). Add a shared
// module by appending an entry here; the drift guard iterates this same list, so nothing else changes.
export const SHARED = [
  {
    source: resolve(repoRoot, 'shared/normalizeUrl.mjs'),
    targets: [
      resolve(repoRoot, 'server/src/vendor/normalizeUrl.GENERATED.mjs'),
      resolve(repoRoot, 'extension/vendor/normalizeUrl.GENERATED.mjs'),
    ],
  },
  {
    source: resolve(repoRoot, 'shared/categories.mjs'),
    targets: [
      resolve(repoRoot, 'server/src/vendor/categories.GENERATED.mjs'),
      resolve(repoRoot, 'extension/vendor/categories.GENERATED.mjs'),
    ],
  },
];

export function syncShared() {
  const written = [];
  for (const { source, targets } of SHARED) {
    const contents = readFileSync(source);
    for (const target of targets) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
      written.push(target);
    }
  }
  return written;
}

// Run directly (`node scripts/sync-shared.mjs`) — but stay importable for the drift test.
if (import.meta.url === `file://${process.argv[1]}`) {
  const written = syncShared();
  for (const t of written) console.log(`synced -> ${t}`);
}
