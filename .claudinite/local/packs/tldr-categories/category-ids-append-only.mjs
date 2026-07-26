// A category id is not a label — it is the STORED value on every comment ever tagged with it, the
// wire value the server validates, and half of the `<pageId>#<category>` GSI key the leading-comment
// lookup queries (server/src/handler.mjs, template.yaml CategoryRankIndex). So the
// taxonomy grows one way only: by APPENDING. Renaming or deleting an id orphans every stored comment
// carrying it (there is no migration and no backfill — the server's public projection just applies
// `category ?? DEFAULT_CATEGORY` at read time), and the damage is invisible in every test, because
// the tests only ever see the ids the current source declares.
//
// The ratchet below is that missing memory: the ids already shipped to real data. It never needs
// touching to ADD a category (the check only requires the shipped ids to still lead the list) — it is
// edited only in the deliberate act of retiring one, which is the moment a human should be looking.
//
// Local pack check — dependency-free (plain finding objects, no engine import) so it runs from the
// repo's own `npm test` without the gitignored Claudinite mount.

import { categoryIds } from './category-presentation-lockstep.mjs';

const RULE_ID = 'tldr-categories/ids-append-only';
const WHY =
  'a category id is the persisted wire value on every comment tagged with it (and half of the CategoryRankIndex key); renaming or removing one orphans that data silently, with no migration path';

const TAXONOMY = 'shared/categories.mjs';

// The ids that have shipped and may therefore exist on stored comments, in their shipped order.
// Append-only growth leaves this list untouched; shortening it is the deliberate retirement of a
// category and must be a considered, reviewed edit.
export const SHIPPED_IDS = ['tldr', 'spoiler', 'chitchat'];

function make(what, fix) {
  return { rule: RULE_ID, severity: 'blocking', file: TAXONOMY, line: null, what, why: WHY, fix, doc: 'RULES.md' };
}

const rule = {
  id: RULE_ID,
  severity: 'blocking',
  description: 'The category taxonomy only ever grows by appending — a shipped id is never renamed, removed or reordered',
  doc: 'RULES.md',
  scope: 'world',
  why: WHY,

  run(ctx) {
    const taxonomy = ctx.read(TAXONOMY);
    if (!taxonomy) return [];
    const ids = categoryIds(taxonomy);
    if (ids === null) return []; // the lockstep check already reports an unreadable taxonomy

    const out = [];
    for (const id of SHIPPED_IDS) {
      if (!ids.includes(id)) {
        out.push(make(`shipped category id "${id}" is no longer in CATEGORIES`,
          `restore "${id}" — comments stored with it would render under DEFAULT_CATEGORY's label; if the retirement is intended, drop it from SHIPPED_IDS in this check in the same, reviewed change`));
      }
    }
    // Growth is by appending: the shipped ids must still lead the list, in their shipped order.
    const head = ids.slice(0, SHIPPED_IDS.length);
    if (out.length === 0 && head.join(',') !== SHIPPED_IDS.join(',')) {
      out.push(make(`the shipped category ids were reordered (expected ${SHIPPED_IDS.join(', ')} to lead, found ${head.join(', ')})`,
        'append new categories after the shipped ones — CATEGORIES order is the display order of the filter tabs and composer options, so reordering silently rearranges the shipped UI'));
    }
    return out;
  },
};

export default rule;
