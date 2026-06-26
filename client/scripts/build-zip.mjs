// Packages the extension into dist/tldr-extension.zip — ONLY the shippable files, never dev/test
// tooling. Uses the system `zip` (present on CI runners). Run with `npm run build`.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Exactly what ships. src/ and vendor/ contain only runtime files; tests live in client/test/,
// dev scripts in client/scripts/ — neither is listed here, so neither is packaged.
export const SHIP = ['manifest.json', 'config.mjs', 'src', 'vendor', 'icons'];

export const ZIP_NAME = 'tldr-extension.zip';

export function buildZip() {
  const distDir = resolve(clientDir, 'dist');
  const zipPath = resolve(distDir, ZIP_NAME);
  mkdirSync(distDir, { recursive: true });
  rmSync(zipPath, { force: true });
  // -X strips extra file attributes so an unchanged build is byte-stable; -r recurses dirs.
  execFileSync('zip', ['-r', '-X', '-q', zipPath, ...SHIP], { cwd: clientDir });
  return zipPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`built ${buildZip()}`);
}
