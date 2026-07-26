# TLDR — repo rules

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
