# Releasing / publishing to the Chrome Web Store

This repo follows the shared Chrome-extension release standard — the canon guide
(`.claudinite/technologies/chrome-extension-release.md`, "the canon release guide" below) owns the
cross-repo contract, the canonical workflow files, and the manual store procedures; this file holds
this repo's concrete names, paths, and listing facts. The zero-to-live sequence (AWS accounts,
OAuth clients, stacks, and the store steps in order) is
[`dev/docs/go-live-runbook.md`](../../docs/go-live-runbook.md).

## The package

`npm run build` (root, delegating to `client/`) produces **`client/dist/tldr.zip`** — exactly the
files the extension ships (the `SHIP` list in `client/scripts/build-zip.mjs`: `manifest.json`,
`config.mjs`, `src/`, `vendor/`, `icons/`), guarded by `client/test/packaging.test.mjs`. The
committed source is dev-pointed on purpose; the release workflow injects the prod config (repo
variables `API_BASE_URL`, `GOOGLE_CLIENT_ID`, `EXTENSION_PUBLIC_KEY`) into staged copies, so only
release builds are prod-pointed (see [`client/README.md`](../../../client/README.md)).

## Versioning

The version users see is `client/manifest.json`'s `version`; `client/package.json` must match
(guarded by `client/test/manifest.test.mjs` and the release workflow). Minor/major bumps are
deliberate, by a human — "bump version" edits both files on a branch and lands on `main` via a
normal PR (default: next minor); merging the bump cuts the release. Patch bumps are made
automatically by the daily auto-release. The Create-Package workflow never changes the version.

## The workflows (the standard set)

- **Release: Create Package** (`release.yml`) — runs on a version-bump merge to `main` (or
  dispatch, or a `workflow_call` from the daily auto-release); clean no-op when the version is
  already released; tags `vX.Y.Z` and attaches `tldr.zip`, so the newest build is always at
  `https://github.com/missingbulb/TLDR/releases/latest/download/tldr.zip`. This repo's deviation
  from the standard: the "Require release config" step fails fast when the three injection
  variables are unset, rather than shipping a dev-pointed zip.
- **Release: Publish to Chrome Web Store** (`publish-chrome-store.yml`) — manual dispatch (blank
  tag = latest release) or called by the daily auto-release; uploads via
  `chrome-webstore-upload-cli@3` with the four standard secrets `CHROME_EXTENSION_ID` /
  `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN`, and refreshes the privacy
  page. Minting the secrets is the standard procedure — "Minting the API credentials" in the
  canon release guide.
- **Release: Daily Auto-Release** (`daily-release.yml`) — daily at 03:00 UTC; ships only when the
  diff since the latest release tag touches the shipping set
  (`client/scripts/filter-shipped-paths.mjs`), patch-bumping first via
  `client/scripts/bump-patch-version.mjs`.
- **Deploy privacy policy to GitHub Pages** (`deploy-privacy-page.yml`) — publishes
  [`store_artifacts/PRIVACY.md`](store_artifacts/PRIVACY.md) at
  `https://missingbulb.github.io/TLDR/privacy/` (standalone dispatch, and on every store publish).
- **Report workflow failure** (`report-failure.yml`) — the reusable reporter all of the above
  escalate to (standing `workflow-failure` tracking issues).

## First publish to the Chrome Web Store

The dashboard walkthrough is the standard procedure — "First publication" in the canon release
guide. This repo's values:

- The extension pins its ID via the manifest `key` (the OAuth redirect URI
  `https://<id>.chromiumapp.org/` depends on it), so the **first draft upload must have no
  `key`**; afterwards copy the dashboard's Package-tab public key into the
  `EXTENSION_PUBLIC_KEY` repo variable and the item ID into the `CHROME_EXTENSION_ID` secret.
  The full ordering (it interleaves with the Google/AWS setup) is the runbook's Phases 1 and 6–7.
- Every dashboard answer — listing copy, single purpose, per-permission justifications
  (optional host permissions and `scripting` included), data-usage declarations, reviewer
  notes — is pre-written in the submission kit,
  [`store_artifacts/STORE-LISTING.md`](store_artifacts/STORE-LISTING.md); the screenshot sits
  beside it. ⚠️ The committed icons are placeholders — replace them before submission. A PR
  that changes the manifest's permissions updates the kit's table in the same PR and opens an
  issue for the manual dashboard step (canon release guide, "When a change touches the
  extension's permissions").
- Privacy Policy URL: `https://missingbulb.github.io/TLDR/privacy/` — the GitHub Pages copy of
  `store_artifacts/PRIVACY.md`, never a `blob/main` link.
