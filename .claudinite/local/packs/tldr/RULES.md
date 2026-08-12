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

## When a rule mandates a form, the check asserts that form — never the intent behind it

Where the prose says *write it exactly like this* ("the class alone on its own line"), the check's
job is to decide whether the artifact is that form. Inferring what the author meant is unbounded in
the wrong direction, and this pack has already paid for it: the first draft of
`comment-class-menu.mjs` (PR #162) fired only on a class token following a negation word from a
hand-picked list, so it stayed **silent** on

```
Comment class: other — unrelated to any feature request        (declares feature)
Comment class: other, setting the feature question to one side (declares feature)
Comment class: correction | feature | process-change | other   (declares all four)
```

— the last being the menu pasted verbatim out of the classifier's own prompt, i.e. the likeliest
way the bug reproduces, missed by the check named for it. The harm came from a class token being
**present**, and prose smuggles tokens in without negating anything, so no marker list could ever
close the gap.

The form test needs no word list to keep extending, and a conforming artifact has nowhere to hide a
violation. Expect it to fire on a line that breaks the form while causing no harm
(`Comment class: correction — fixed the typo` smuggles nothing) — that is the rule as written doing
its job. Don't re-add intent-guessing to soften it.

## A finding no edit can retract ships `advisory`

The canon's severity call is "blocking for a defect, advisory only when the rule is directional by
kind". This repo has a third case: the condition is real and blocking-grade, but by the time it is
observable it **cannot be undone**. The session transcript is append-only, so a blocking
`Comment class:` finding could never converge — it would spend the session's Stop cycles on
something no edit can fix, which is exactly the waste the lesson records. PR #151 shipped it
blocking and was reverted the same day; PR #162 shipped it advisory and merged.

An advisory finding on an irreversible condition is **diagnostic**: it names the cause the moment it
appears, so the session doesn't re-derive it from an unexplained downstream failure (here, a
`feature-requirements-first` BLOCKING nobody can trace to a stray word).

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
