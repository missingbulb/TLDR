// Drift guard: the vendored copies of the URL normalizer MUST stay byte-identical to the
// canonical shared/normalizeUrl.mjs. If they diverge, the client and server can normalize the
// same URL differently, writing/reading comments under different pageIds — a silent data loss.
//
// This is the single-source-of-truth drift guard mandated by the repo's engineering practices.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCE, VENDORED } from '../sync-shared.mjs';

test('every vendored normalizeUrl copy is byte-identical to the canonical source', () => {
  const source = readFileSync(SOURCE);
  for (const copy of VENDORED) {
    const vendored = readFileSync(copy);
    assert.ok(
      source.equals(vendored),
      `${copy} has drifted from shared/normalizeUrl.mjs — run \`npm run sync-shared\` and commit the result.`,
    );
  }
});
