// SINGLE SOURCE OF TRUTH for the comment CATEGORY taxonomy, shared by the server (Lambda) and the
// client (Chrome extension). Every comment is tagged with exactly one category: the server validates
// the tag against this allowlist on write, and the client builds its composer picker, its filter bar,
// and each note's badge from this SAME list — so the two sides can never disagree on what categories
// exist. This is the same single-source discipline as shared/normalizeUrl.mjs (a divergence there is
// silent data loss; a divergence here is a note the server accepts but the client can't show, or
// vice-versa).
//
// This file is the canonical copy. It is vendored verbatim into the places that cannot import across
// the repo at runtime:
//   - server/src/vendor/categories.GENERATED.mjs  (so SAM/esbuild bundling is path-robust)
//   - extension/vendor/categories.GENERATED.mjs       (so the extension ships a self-contained copy)
// Run `npm run sync-shared` after editing this file; CI fails on byte drift (test/shared-drift.test.mjs).
//
// GROWABLE CURATED LIST (owner decision, issue #25): the set is NOT closed but users can't invent
// categories — a maintainer extends it by APPENDING to CATEGORIES below. Validation is therefore an
// allowlist membership check, not a frozen enum, and the filter bar renders exactly this known list
// (no dynamic/derived set, so no near-duplicate sprawl). Adding a category = append one entry here +
// `npm run sync-shared`; the client picker/filter and the server validation both pick it up.

// The ordered category taxonomy. `id` is the stored / wire / cache-key value (lowercase); `label` is
// the display text (the composer option, the filter tab, the per-note badge). ORDER is the display
// order of the filter tabs and the composer options. Append to grow the set; never reorder for meaning
// and never rename or remove an existing `id` — it is persisted on every comment ever tagged with it.
export const CATEGORIES = [
  { id: 'tldr', label: 'TLDR' },
  { id: 'spoiler', label: 'Spoiler' },
  { id: 'chitchat', label: 'Chitchat' },
];

// The read-time default for a comment carrying NO category — pre-existing rows written before
// categories existed, and any older client that posts without one. Applied in the server's public
// projection (`category ?? DEFAULT_CATEGORY`) so there is NO migration/backfill, and on the client
// when it renders a note's badge / filters. MUST be one of CATEGORIES' ids.
export const DEFAULT_CATEGORY = 'chitchat';

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

// Normalize a raw category value to its canonical id form (trim + lowercase). A non-string coerces to
// a string first, so a malformed value just fails isValidCategory below rather than throwing.
export function normalizeCategory(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Is `id` a known category id? (Allowlist membership — the server's write-time validation.)
export function isValidCategory(id) {
  return BY_ID.has(id);
}

// The display label for a category value. An absent value (null/undefined/empty) renders under the
// DEFAULT_CATEGORY's label, so an untagged note never shows a blank/undefined badge; an unknown-but-
// present id (e.g. a newer category an older client hasn't shipped yet) degrades to its raw id rather
// than vanishing or being mislabelled as the default.
export function categoryLabel(id) {
  if (id == null || id === '') return BY_ID.get(DEFAULT_CATEGORY).label;
  return BY_ID.get(id)?.label ?? String(id);
}
