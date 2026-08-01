# TLDR — repo rules

## A pack carries how we work — never what the product does

Claudinite packs, this one included, home **work procedures**: the conventions, gotchas and review
discipline that recur across tasks, whatever the feature happens to be. They are not a home for the
product's own feature definitions. A rule that describes what TLDR *does* — which categories exist,
what a surface must render, how the parts of a feature must be wired to each other — is a
**requirement**, and its home is the executable spec (`dev/requirements/`, one numbered leaf claimed
by one case) and the suite that proves it. Encoding it as a pack rule instead splits one feature's
definition across two systems and lands it in the one that no test of the product ever reads.

The worked example: the weekly `growth-discover-packs` run authored a `tldr-categories` local pack
(PR #121, closed unmerged) whose blocking checks asserted that every id in `shared/categories.mjs`
carries its design descriptor, its scoped stylesheet, its registry entry and its `sidepanel.html`
link. The silent-failure risk it named is real — but "a category is wired into all four presentation
files" is a statement about the *feature*, so it belongs in `dev/requirements/` and the extension's
own suite. **Pack-worthiness is a question about the work, not about how load-bearing the code is**;
a genuine gap in *product* coverage is a requirements gap, and answering it with a pack is how a
feature's spec ends up somewhere nothing executes it.

## A green release run is not evidence the store publish works

The daily auto-release short-circuits at `daily / check` when nothing under the release config's
`ship_paths` changed since the last release tag, so `Release to Chrome Store` concludes **success**
with the `daily / publish` job skipped entirely. Since the scheduler cutover (#107) the daily leg
runs only when the Claudinite scheduler dispatches this workflow in `mode: daily`, so a real publish
is rarer still — most green runs never touched the store.

When triaging a publish-leg failure, read the **`daily / publish` job**, not the run conclusion. The
open example is #93/#94 (run 29229001858): three separate triage passes (07-16, 07-18, 07-26) each
re-derived that no later run had re-executed the step, and each re-nominated #87's version desync as
the "suspected root cause, unconfirmed". Two things settle it and are worth not re-deriving a fourth
time:

- **`ITEM_NOT_UPDATABLE` is Chrome Web Store-side state** — a prior submission still pending review
  or ready to publish — so **nothing in `main` can be "the fix"**, and no repo-side defect that
  happened to be open at the time (a version desync, a stale secret) should be credited with it.
- **The only closing evidence is a run that actually reaches `daily / publish` and goes green**, or
  the Chrome Developer Dashboard showing the item out of pending/review. Absent that, the issue stays
  open — resolving the co-occurring repo bug is not the same as verifying the publish path.

## Put the `Comment class:` line on its own line — naming the other classes on it declares them

The classifier reads the **whole** classification line and adds *every* class token it finds
(`classesIn()` in `.claudinite/shared/engine/checks/helpers/session-transcript.mjs` matches
`correction|feature|process-change|other` globally). So the natural-sounding

> `Comment class: other` — not a correction, feature request, or process-change

declares **all four** classes, not `other`. The stray `feature` then arms
`feature-requirements-first`, which files BLOCKING against whatever commits the branch carries for
lacking a preceding `dev/requirements/requirements.md` commit — even when the session is a
scheduled task that never touched a product feature.

**It cannot be taken back.** The transcript is append-only; re-declaring cleanly on a later line
does not override the poisoned one. Both sessions on 2026-07-26 tried and failed, and each had to
pay in real work instead: the growth-extract run (#114) reverted its legitimate `.gitignore` fix and
closed PR #119 unmerged (~8 min); the discover-packs run (#113) burned two Stop cycles before
resetting its checkout (~4 min).

## Run a task subagent under `isolation: "worktree"`

An `Agent` call without it leaves the parent session's checkout wherever the child left it — on the
child's branch. The branch-scoped Stop checks then judge the **child's** commits against the
**parent's** transcript, producing findings the parent cannot act on. That is exactly how #113's
Stop cycle came to blame a subagent's `.claudinite-checks.json` commit; #114's run passed
`isolation: "worktree"` for the same shape of dispatch and never saw it. Recovery is to `git
checkout` the session's own assigned branch and re-verify — but pass the isolation flag and skip
the detour.

## The three version records, and the two the pipeline actually bumps

This repo carries the extension version in **three** files, and only two of them move on their own:

- `extension/manifest.json` — the shipped, user-visible version.
- `extension/package.json` — kept in lockstep by the daily auto-release, which patch-bumps exactly the two paths named in `.github/release.config` (`manifest_path`, `package_json_path`). `extension-test/manifest.test.mjs` asserts this pair agrees.
- the **root** `package.json` — nothing automated touches it. But the `cer/version-sync` alignment check reads the repo-root `package.json` by name (not the release-config path) and compares it to the manifest.

So the root version diverges again after every daily patch bump, and the nightly alignment sweep re-files it BLOCKING. That is expected drift, not a new bug.

**Resolve it by aligning the root `package.json` up to the manifest.** Never edit the manifest down to match, and never increment past the shipped version — a drift correction is not a release bump.

Two traps this has already cost time on:

- **Don't read `extension/manifest.json` == `extension/package.json` as "resolved".** That is the pair the release config keeps in sync and the pair the offline suite checks — not the pair `cer/version-sync` compares. Triage has twice called the finding resolved on that basis while the root file was still stale.
- **Don't guard it by asserting the root version in `extension-test/manifest.test.mjs`.** That suite *is* the release config's `test_command` (`npm --prefix extension test`), and it runs after the bump has moved only the two extension files — the assertion would fail every auto-release. Closing the loop properly means changing what the bump touches, not what the test asserts.

## When converting mandated prose to a check, assert the mandated form — never infer the author's intent

A rule that tells the agent to write something **verbatim** ("write the class alone on its own
line") is already a form, and the check should anchor the whole artifact against that form. The
tempting alternative — ask whether the author *meant* the thing the rule forbids — is not
observable, so it can only be approximated by a heuristic, and the heuristic is where the hole goes.

The worked example is `tldr/comment-class-menu`. Its first draft (PR #162, opened 2026-07-31)
fired only on a class token appearing *after* a negation word from a hand-picked list (`not`,
`never`, `besides`, …). Probed against the classifier's real `classesIn()` helper, it was **silent**
on three lines that all really do declare a stray class — including `Comment class: correction |
feature | process-change | other`, the menu pasted verbatim out of the classifier's own prompt, and
the likeliest way anyone reproduces the bug the check is *named for*. Rewritten to anchor the line
against the conforming form (`^<class>(, <class>)*\.?$`), all three fire and the fixture
mutation-proves in both directions.

So: **when the prose names a literal form, match that form and reject everything else** — one
anchored regex, no word list to keep current. Reserve intent-inference for rules whose prose really
is directional. The tell that you have picked the wrong framing: you are assembling a list of words
that "signal" what the author had in mind.
