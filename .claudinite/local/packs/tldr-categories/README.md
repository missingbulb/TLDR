# tldr-categories pack (local)

This repo's own pack for the comment **category taxonomy** — the product concept that spans both
halves of TLDR (`shared/categories.mjs` → the server's write-time allowlist and read-time default, the
extension's picker/filter/badges and its per-category look). Nothing here is portable: it is the
product, so it lives in the project's local packs rather than the canon shelf. Declared by hand as
`tldr-categories` in `.claudinite-checks.json` (local packs are never fingerprinted).

## Checks

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `tldr-categories/presentation-lockstep` | Category carries its presentation layer | blocking |
| `tldr-categories/ids-append-only` | Shipped category ids only grow | blocking |

Both are `scope: 'world'` (a state of the tree, not of a diff) and dependency-free — plain finding
objects, no engine import — so `.claudinite/local/packs/tldr-categories/pack.test.mjs` runs them from
the repo's own `npm test`, mount or no mount. That test is red-first: it asserts each rule fires on a
violating in-memory fixture, stays silent on a clean one, **and** that the real repo is clean today.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Ids are stored data; labels aren't | prose + check (`ids-append-only`) |
| Unknown/absent categories degrade, never error | prose |
| The GSI has no backfill | prose |
| Categories differ in look, never behaviour | prose |
| Append + `npm run sync-shared` grows the set | prose + check (`presentation-lockstep`) |

Distilled from this repo's real files: `shared/categories.mjs`, `extension/src/categories/`,
`extension/src/sidepanel.html`, `server/src/handler.mjs`, `server/template.yaml`,
`dev/build/tools/sync-shared.mjs` (issues #25, #26).
