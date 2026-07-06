// Bumps the extension's PATCH version (x.y.Z -> x.y.Z+1) across the two files that carry it —
// client/manifest.json and client/package.json — by exact-token replacement (not JSON
// re-serialization, so formatting is preserved). Prints ONLY the new version on stdout; the
// daily auto-release workflow captures it.
//
//   node client/scripts/bump-patch-version.mjs [repo-root]     (repo-root defaults to this repo)
//
// Dependency-free on purpose: the daily-release workflow runs it on a bare runner (no npm ci).
// Deliberate human bumps stay a PR ("bump version", default minor) — this is only the daily
// pipeline's automated increment. Both files are validated before either is written, so a
// half-bumped tree is impossible.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const FILES = ['client/manifest.json', 'client/package.json'].map((p) => resolve(root, p));

const current = JSON.parse(readFileSync(FILES[0], 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(current)) {
  console.error(`bump-patch-version: manifest version '${current}' is not X.Y.Z`);
  process.exit(1);
}
const [major, minor, patch] = current.split('.').map(Number);
const next = `${major}.${minor}.${patch + 1}`;

const token = `"version": "${current}"`;
const updated = FILES.map((file) => {
  const text = readFileSync(file, 'utf8');
  const count = text.split(token).length - 1;
  if (count !== 1) {
    console.error(`bump-patch-version: expected exactly one ${token} in ${file}, found ${count} — bump both files together.`);
    process.exit(1);
  }
  return { file, text: text.replace(token, `"version": "${next}"`) };
});

for (const { file, text } of updated) writeFileSync(file, text);
process.stdout.write(`${next}\n`);
