// Drift guard: every vendored copy of a shared module MUST stay byte-identical to its canonical
// source under shared/. If the URL normalizer diverges, the client and server can normalize the same
// URL differently, writing/reading comments under different pageIds — a silent data loss. If the
// category taxonomy diverges, one side accepts (or shows) a category the other doesn't — a note the
// server stores but the client can't display, or a filter tab for a category the server would reject.
//
// This is the single-source-of-truth drift guard mandated by the repo's engineering practices.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHARED } from '../sync-shared.mjs';

test('every vendored shared copy is byte-identical to its canonical source', () => {
  for (const { source, targets } of SHARED) {
    const src = readFileSync(source);
    for (const copy of targets) {
      const vendored = readFileSync(copy);
      assert.ok(
        src.equals(vendored),
        `${copy} has drifted from ${source} — run \`npm run sync-shared\` and commit the result.`,
      );
    }
  }
});
