# TLDR — repo rules

## A `.claudinite/`-only PR gets no CI — don't wait for checks that will never run

The test workflows are `paths:`-filtered away from `.claudinite/`, so a PR touching only that tree
gets **zero** check runs — don't poll for green on one; check the PR's file list first. (The
`tldr/ci-excludes-claudinite` check flags if a workflow ever starts covering `.claudinite/`, so this
stays true or the rule gets caught stale — see `ci-excludes-claudinite.mjs`.)

If `mcp__github__enable_pr_auto_merge` ever hard-errors with *"Auto-merge is not enabled for this
repository"*, that names a GitHub repo setting (Settings → General → Pull Requests → Allow
auto-merge), not a bug — only the owner can flip it, no commit can. When it happens, don't report
the run as "landed": say plainly in the PR body, the tracker comment and your final summary that the
PR is open and awaiting the owner's merge.

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

## The three version records, and the two the pipeline actually bumps

This repo carries the extension version in **three** files, and only two of them move on their own:

- `extension/manifest.json` — the shipped, user-visible version and the source of truth.
- `extension/package.json` — kept in lockstep by the daily auto-release, which patch-bumps exactly the two paths named in `.github/release.config` (`manifest_path`, `package_json_path`). `extension-test/manifest.test.mjs` asserts this pair agrees.
- the **root** `package.json` — nothing automated touches it. But the `cer/version-sync` alignment check reads the repo-root `package.json` by name (not the release-config path) and compares it to the manifest.

So the root version diverges again after every daily patch bump, and the nightly alignment sweep re-files it BLOCKING. That is expected drift, not a new bug.

**Resolve it by aligning the root `package.json` up to the manifest.** The manifest is the source of truth for what shipped; never edit the manifest down to match, and never increment past the shipped version — a drift correction is not a release bump.

Two traps this has already cost time on:

- **Don't read `extension/manifest.json` == `extension/package.json` as "resolved".** That is the pair the release config keeps in sync and the pair the offline suite checks — not the pair `cer/version-sync` compares. Triage has twice called the finding resolved on that basis while the root file was still stale.
- **Don't guard it by asserting the root version in `extension-test/manifest.test.mjs`.** That suite *is* the release config's `test_command` (`npm --prefix extension test`), and it runs after the bump has moved only the two extension files — the assertion would fail every auto-release. Closing the loop properly means changing what the bump touches, not what the test asserts.
