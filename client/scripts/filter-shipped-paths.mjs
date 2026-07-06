// Filters a list of repo-relative paths (stdin, one per line — e.g. `git diff --name-only`)
// down to the ones that SHIP in the extension zip, deriving the shipped set from build-zip.mjs's
// SHIP list so "deployable" can't drift from what the zip actually contains. The daily
// auto-release workflow pipes a diff through this to decide whether a release is warranted:
// empty output = nothing deployable changed. Always exits 0.
//
// Dependency-free on purpose (build-zip.mjs imports only node: modules): the daily-release
// workflow runs it on a bare runner (no npm ci).

import { SHIP } from './build-zip.mjs';

const shipped = (path) =>
  SHIP.some((entry) => path === `client/${entry}` || path.startsWith(`client/${entry}/`));

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

const matches = input
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && shipped(line));

if (matches.length) process.stdout.write(`${matches.join('\n')}\n`);
