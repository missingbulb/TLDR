// The comment CATEGORY taxonomy (shared/categories.mjs) is the wire contract both halves of TLDR
// read: the server validates a posted `category` against it and the client builds its picker, filter
// bar and badges from the same list. Its PRESENTATION layer, though, lives in four other files that
// nothing links back to the taxonomy — extension/src/categories/<id>/design.mjs, the sibling scoped
// <id>.css, the registry.mjs DESIGNS map and the sidepanel.html stylesheet links. Every one of those
// FAILS SILENTLY when a category is added without it: `designFor()` falls back to the default
// category's descriptor, an unlinked stylesheet just never applies. The new category ships wearing
// another category's copy and colours, and no test, build or runtime error says so. This check is
// that missing feedback: append to CATEGORIES and the presentation layer must move in lockstep.
//
// Local pack check — deliberately dependency-free (plain finding objects, no engine import) so it
// loads and runs from the repo's own `npm test` without the gitignored Claudinite mount.

const RULE_ID = 'tldr-categories/presentation-lockstep';
const WHY =
  'the design registry silently falls back to the default category, so a half-added category ships wearing another category\'s copy and colours with no error anywhere';

const TAXONOMY = 'shared/categories.mjs';
const REGISTRY = 'extension/src/categories/registry.mjs';
const SIDEPANEL = 'extension/src/sidepanel.html';

// The taxonomy is a literal array of `{ id: '<id>', label: '<Label>' }` entries (never computed —
// see the "GROWABLE CURATED LIST" note in the source), so reading the ids is a scan of that block
// rather than an import: the check must work on a file that would not even load.
export function categoryIds(source) {
  const block = source?.match(/export const CATEGORIES = \[([\s\S]*?)\n\];/);
  if (!block) return null;
  return [...block[1].matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
}

export function defaultCategory(source) {
  return source?.match(/export const DEFAULT_CATEGORY = '([^']+)'/)?.[1] ?? null;
}

function make(file, what, fix) {
  return { rule: RULE_ID, severity: 'blocking', file, line: null, what, why: WHY, fix, doc: 'RULES.md' };
}

const rule = {
  id: RULE_ID,
  severity: 'blocking',
  description: 'Every category in the shared taxonomy carries its full presentation layer (design, scoped css, registry entry, stylesheet link)',
  doc: 'RULES.md',
  scope: 'world',
  why: WHY,

  run(ctx) {
    const taxonomy = ctx.read(TAXONOMY);
    // No taxonomy file = not this repo's shape; stay silent rather than guess.
    if (!taxonomy) return [];
    const ids = categoryIds(taxonomy);
    if (ids === null || ids.length === 0) {
      return [make(TAXONOMY, 'the CATEGORIES array could not be read as literal { id, label } entries',
        'keep CATEGORIES a literal array of { id: \'<id>\', label: \'<Label>\' } entries — the taxonomy is read by tooling, not only by imports')];
    }

    const out = [];
    const registry = ctx.read(REGISTRY) ?? '';
    const sidepanel = ctx.read(SIDEPANEL) ?? '';

    const fallback = defaultCategory(taxonomy);
    if (fallback && !ids.includes(fallback)) {
      out.push(make(TAXONOMY, `DEFAULT_CATEGORY is "${fallback}", which is not one of the CATEGORIES ids`,
        'point DEFAULT_CATEGORY at a real category id — every read-time fallback (the server projection, categoryLabel, designFor) dereferences it'));
    }

    for (const id of ids) {
      const design = `extension/src/categories/${id}/design.mjs`;
      const css = `extension/src/categories/${id}/${id}.css`;
      const designSrc = ctx.read(design);

      if (designSrc === null) {
        out.push(make(design, `category "${id}" has no design descriptor`,
          `add ${design} exporting { id: '${id}', title, postLabel, placeholder } — without it designFor('${id}') silently serves the default category's copy`));
      } else if (!new RegExp(`\\bid:\\s*'${id}'`).test(designSrc)) {
        out.push(make(design, `the design descriptor for "${id}" does not declare id: '${id}'`,
          `set id: '${id}' in the descriptor so it matches the taxonomy id it is keyed by`));
      }

      const cssSrc = ctx.read(css);
      if (cssSrc === null) {
        out.push(make(css, `category "${id}" has no scoped stylesheet`,
          `add ${css} scoping its colour tokens to body[data-category="${id}"]`));
      } else if (!cssSrc.includes(`body[data-category="${id}"]`)) {
        out.push(make(css, `the "${id}" stylesheet is not scoped to body[data-category="${id}"]`,
          'scope every rule to body[data-category="<id>"] — an unscoped category stylesheet restyles the other categories too'));
      }

      // registry.mjs must both import the descriptor and key it into DESIGNS; an import alone
      // leaves designFor() returning the default.
      if (!new RegExp(`from\\s+'\\./${id}/design\\.mjs'`).test(registry)) {
        out.push(make(REGISTRY, `category "${id}" is not imported into the design registry`,
          `add \`import ${id} from './${id}/design.mjs';\` to ${REGISTRY}`));
      }
      if (!new RegExp(`(?:^|[{,\\s])${id}\\s*[,:}]`).test(registry.match(/const DESIGNS = \{[^}]*\}/)?.[0] ?? '')) {
        out.push(make(REGISTRY, `category "${id}" is missing from the DESIGNS map`,
          `add \`${id}\` to the DESIGNS map in ${REGISTRY} — designFor('${id}') falls back to the default category's design until it is there`));
      }

      if (!sidepanel.includes(`categories/${id}/${id}.css`)) {
        out.push(make(SIDEPANEL, `the "${id}" stylesheet is never linked from the side panel`,
          `add <link rel="stylesheet" href="categories/${id}/${id}.css" /> to ${SIDEPANEL} — an unlinked stylesheet applies nowhere and nothing errors`));
      }
    }
    return out;
  },
};

export default rule;
