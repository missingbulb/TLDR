# TLDR — repo rules

## A green release run is not evidence the store publish works

The daily auto-release short-circuits at `daily / check` when nothing under the release config's
`ship_paths` changed since the last release tag, so `Release to Chrome Store` concludes **success**
with the `daily / publish` job skipped entirely. Since the scheduler cutover (#107) the daily leg
runs only when the Claudinite scheduler dispatches this workflow in `mode: daily`, so a real publish
is rarer still — most green runs never touched the store.

When triaging a publish-leg failure, read the **`daily / publish` job**, not the run conclusion. The
open example is #93/#94 (run 29229001858): three separate triage passes (07-16, 07-18, 07-26) each
re-derived that no later run had re-executed the step, and each re-nominated whichever repo-side bug
happened to be open at the time as the "suspected root cause, unconfirmed". Two things settle it and
are worth not re-deriving a fourth time:

- **`ITEM_NOT_UPDATABLE` is Chrome Web Store-side state** — a prior submission still pending review
  or ready to publish — so **nothing in `main` can be "the fix"**, and no repo-side defect that
  happened to be open at the time (a stale secret, a half-landed config) should be credited with it.
- **The only closing evidence is a run that actually reaches `daily / publish` and goes green**, or
  the Chrome Developer Dashboard showing the item out of pending/review. Absent that, the issue stays
  open — resolving the co-occurring repo bug is not the same as verifying the publish path.

## This repo's copy of the daily-release workflow is deliberately not the canon stub

`.github/workflows/chrome-extension-daily-release.yml` is vendored from `chrome-extension-release`,
and the canon line for a vendored file — *never hand-edit these copies, the template is canon* —
does **not** hold for this one: since #241 it carries a local step aligning the repo-root
`package.json`, and `chrome-release-vendoring`'s materialize is an unconditional verbatim overwrite
with no per-repo exemption seam. `tldr/release-root-version-align` reds if the step goes missing;
#245 is the open decision on the real fix. So when baselining §2b hands you this path as a withheld
workflow file, **diff it against the stub and land the union, never the stub**.

Reproducing what preprocessing wanted to write takes the **full canon clone**, not this repo's
mount: `node .claudinite/shared/engine/migrations/apply.mjs` writes nothing here, because the
`chrome-release-vendoring` record has aged out of the vendored subset. Clone
`missingbulb/Claudinite` shallow and run *its* `apply.mjs` with `CLAUDE_PROJECT_DIR` and
`CLAUDINITE_CAN_WITHHOLD_WORKFLOWS=1` pointed at a worktree of `main`.

## Nothing in CI runs this pack's fixtures — invoke them by hand

No npm script globs `.claudinite/local/packs/**`. Root `npm test` covers `shared/test/` and
`dev/build/tools/test/`; the three sub-suites `test:all` chains cover `extension-test/`,
`server/test/` and `dev/requirements/`. `claudinite-conformance.yml` runs
`check_the_world.mjs`, which *loads* every rule module (so a broken import surfaces) but never
executes a fixture — and never runs a `scope: 'work'` rule at all, which is what this pack's checks
are.

So a green `npm run test:all` says nothing about a rule in here. Run its fixture directly when you
touch one:

```
node --test .claudinite/local/packs/tldr/comment-class-menu.test.mjs
```
