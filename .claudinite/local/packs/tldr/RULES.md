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

Write the class alone — `Comment class: other` — and put any explanation on the **next** line. A
genuinely mixed comment still names each part it really is, on that one line; the rule is against
restating the *menu*, not against honest multi-class declarations.

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
