import presentationLockstep from './category-presentation-lockstep.mjs';
import idsAppendOnly from './category-ids-append-only.mjs';

// TLDR's own comment-CATEGORY taxonomy: the product concept that spans both halves of the repo
// (shared/categories.mjs is the single source; the server validates against it, the extension builds
// its picker, filter bar, badges and per-category look from it). Nothing portable here — this is the
// product, so it lands in the project's own local pack rather than a canon one. Declared by hand
// (`tldr-categories` in .claudinite-checks.json); local packs are never fingerprinted, so
// detect/marker stay null.
export default {
  id: 'tldr-categories',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  rules: [presentationLockstep, idsAppendOnly],
  skills: [],
};
