// Red-first fixtures for the tldr-categories pack's checks: each rule must FIRE on a violating tree
// and stay SILENT on a clean one — and, the part that makes them a real guard rather than a
// self-consistent toy, both must be silent on THIS repo as it stands today.
//
// The checks are `scope: 'world'` and touch the context only through `read`, so a fixture is a plain
// map of path → contents; no temp dirs, no engine import (the mount is not guaranteed present).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import presentationLockstep from './category-presentation-lockstep.mjs';
import idsAppendOnly, { SHIPPED_IDS } from './category-ids-append-only.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');

const ctxOver = (files) => ({ read: (p) => (p in files ? files[p] : null), exists: (p) => p in files });
const realCtx = {
  read(p) {
    try { return readFileSync(join(repoRoot, p), 'utf8'); } catch { return null; }
  },
  exists: (p) => realCtx.read(p) !== null,
};

const taxonomy = (ids, def = ids[0]) => `
export const CATEGORIES = [
${ids.map((id) => `  { id: '${id}', label: '${id}' },`).join('\n')}
];

export const DEFAULT_CATEGORY = '${def}';
`;

// A tree whose presentation layer is complete for every id it declares.
function cleanTree(ids) {
  const files = {
    'shared/categories.mjs': taxonomy(ids, ids[0]),
    'extension/src/categories/registry.mjs':
      `${ids.map((id) => `import ${id} from './${id}/design.mjs';`).join('\n')}\nconst DESIGNS = { ${ids.join(', ')} };\n`,
    'extension/src/sidepanel.html':
      ids.map((id) => `<link rel="stylesheet" href="categories/${id}/${id}.css" />`).join('\n'),
  };
  for (const id of ids) {
    files[`extension/src/categories/${id}/design.mjs`] = `export default { id: '${id}', title: '${id}' };\n`;
    files[`extension/src/categories/${id}/${id}.css`] = `body[data-category="${id}"] { --accent: #000; }\n`;
  }
  return files;
}

const ids = SHIPPED_IDS;

test('presentation-lockstep is silent on a complete tree', () => {
  assert.deepEqual(presentationLockstep.run(ctxOver(cleanTree(ids))), []);
});

test('presentation-lockstep fires on a category with no design folder at all', () => {
  const files = cleanTree(ids);
  files['shared/categories.mjs'] = taxonomy([...ids, 'rant'], ids[0]);
  const findings = presentationLockstep.run(ctxOver(files));
  // design.mjs, <id>.css, the import, the DESIGNS entry and the stylesheet link — all five.
  assert.equal(findings.length, 5);
  assert.ok(findings.every((f) => f.rule === 'tldr-categories/presentation-lockstep'));
  assert.ok(findings.every((f) => f.severity === 'blocking' && f.fix && f.why));
  assert.ok(findings.some((f) => f.file === 'extension/src/categories/rant/design.mjs'));
  assert.ok(findings.some((f) => f.file === 'extension/src/sidepanel.html'));
});

test('presentation-lockstep fires on each half-done presentation layer', () => {
  // Imported but never keyed into DESIGNS — designFor() silently serves the default's copy.
  const noEntry = cleanTree([...ids, 'rant']);
  noEntry['extension/src/categories/registry.mjs'] =
    noEntry['extension/src/categories/registry.mjs'].replace(', rant }', ' }');
  assert.deepEqual(
    presentationLockstep.run(ctxOver(noEntry)).map((f) => f.what),
    ['category "rant" is missing from the DESIGNS map'],
  );

  // Stylesheet present but unscoped — it would restyle every other category.
  const unscoped = cleanTree([...ids, 'rant']);
  unscoped['extension/src/categories/rant/rant.css'] = 'body { --accent: #000; }\n';
  assert.equal(presentationLockstep.run(ctxOver(unscoped)).length, 1);

  // Stylesheet never linked from the side panel — it applies nowhere, silently.
  const unlinked = cleanTree([...ids, 'rant']);
  unlinked['extension/src/sidepanel.html'] =
    unlinked['extension/src/sidepanel.html'].replace(/^.*rant.*$/m, '');
  assert.equal(presentationLockstep.run(ctxOver(unlinked)).length, 1);

  // Descriptor keyed under a different id than the taxonomy's.
  const mismatched = cleanTree([...ids, 'rant']);
  mismatched['extension/src/categories/rant/design.mjs'] = "export default { id: 'rants' };\n";
  assert.equal(presentationLockstep.run(ctxOver(mismatched)).length, 1);
});

test('presentation-lockstep fires when DEFAULT_CATEGORY is not a real category id', () => {
  const files = cleanTree(ids);
  files['shared/categories.mjs'] = taxonomy(ids, 'nope');
  const findings = presentationLockstep.run(ctxOver(files));
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /DEFAULT_CATEGORY is "nope"/);
});

test('presentation-lockstep reports a taxonomy it cannot read, and stays silent off-shape', () => {
  const files = cleanTree(ids);
  files['shared/categories.mjs'] = 'export const CATEGORIES = buildCategories();\n';
  assert.equal(presentationLockstep.run(ctxOver(files)).length, 1);
  // No taxonomy file at all = not this repo's shape; say nothing rather than guess.
  assert.deepEqual(presentationLockstep.run(ctxOver({})), []);
});

test('ids-append-only is silent when the set only grows', () => {
  assert.deepEqual(idsAppendOnly.run(ctxOver(cleanTree(ids))), []);
  assert.deepEqual(idsAppendOnly.run(ctxOver(cleanTree([...ids, 'rant']))), []);
});

test('ids-append-only fires on a renamed or removed shipped id', () => {
  const renamed = cleanTree([ids[0], 'spoilers', ...ids.slice(2)]);
  const findings = idsAppendOnly.run(ctxOver(renamed));
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /shipped category id "spoiler" is no longer in CATEGORIES/);
  assert.equal(findings[0].file, 'shared/categories.mjs');

  assert.equal(idsAppendOnly.run(ctxOver(cleanTree(ids.slice(1)))).length, 1);
});

test('ids-append-only fires when a new category is prepended instead of appended', () => {
  const findings = idsAppendOnly.run(ctxOver(cleanTree(['rant', ...ids])));
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /reordered/);
});

test('the real repository satisfies both checks', () => {
  assert.deepEqual(presentationLockstep.run(realCtx), []);
  assert.deepEqual(idsAppendOnly.run(realCtx), []);
});
