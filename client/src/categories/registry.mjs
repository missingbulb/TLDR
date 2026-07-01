// Per-category DESIGN registry (issue #25). Each category owns a folder under client/src/categories/
// holding STRICTLY presentation: a scoped CSS file (categories/<id>/<id>.css — its colour tokens,
// linked in sidepanel.html and biting only when that category is active) and a design descriptor
// (categories/<id>/design.mjs — its copy). This registry maps a category id → its descriptor.
//
// DESIGN ONLY, NO BEHAVIOR (owner constraint): a category folder may restyle/relabel itself with zero
// effect on any other category, but no category may BEHAVE differently — the shared panel code drives
// every category identically and only reads these presentation values. Keep this file (and every
// design.mjs) free of logic/conditionals beyond the lookup.
//
// Keyed by the shared category ids (shared/categories.mjs is the functional taxonomy; this is its
// presentation layer). A category with no folder falls back to the default category's design.

import { DEFAULT_CATEGORY } from '../../vendor/categories.GENERATED.mjs';
import tldr from './tldr/design.mjs';
import spoiler from './spoiler/design.mjs';
import chitchat from './chitchat/design.mjs';

const DESIGNS = { tldr, spoiler, chitchat };

// The design descriptor for a category id (its composer copy). Falls back to the default category's
// design for an unknown/absent id, so the panel always has copy to render.
export function designFor(id) {
  return DESIGNS[id] ?? DESIGNS[DEFAULT_CATEGORY];
}
