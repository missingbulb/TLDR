// Copies the canonical shared/normalizeUrl.mjs VERBATIM into the two vendored locations that
// can't import across the repo at runtime. Run after editing shared/normalizeUrl.mjs.
//
// The copies are byte-identical to the source (the GENERATED marker lives in the filename), so
// test/shared-drift.test.mjs can guard drift with a simple byte-equality check.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const SOURCE = resolve(repoRoot, 'shared/normalizeUrl.mjs');
export const VENDORED = [
  resolve(repoRoot, 'server/src/vendor/normalizeUrl.GENERATED.mjs'),
  resolve(repoRoot, 'client/vendor/normalizeUrl.GENERATED.mjs'),
];

export function syncShared() {
  const contents = readFileSync(SOURCE);
  for (const target of VENDORED) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return VENDORED;
}

// Run directly (`node scripts/sync-shared.mjs`) — but stay importable for the drift test.
if (import.meta.url === `file://${process.argv[1]}`) {
  const written = syncShared();
  for (const t of written) console.log(`synced -> ${t}`);
}
