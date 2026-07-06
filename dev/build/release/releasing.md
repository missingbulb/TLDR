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

Four thin stubs in `.github/workflows/` call the standard's reusable workflows in the Claudinite
canon — the set's shape, triggers, and behavior (including failure reporting to standing
`workflow-failure` tracking issues) are the canon release guide's "Workflows" section; don't
restate them here. Only this repo's values, passed as the stubs' `with:` inputs, live here:

- Zip: `client/dist/tldr.zip`, asset name `tldr.zip` — the newest build is always at
  `https://github.com/missingbulb/TLDR/releases/latest/download/tldr.zip`.
- Paths: manifest and package.json under `client/`; no root install (`setup_command: ""`); test
  gate = root `npm test`, then `npm test` in `client/`; build runs in `client/`.
- This repo's deviation, expressed via the `build_env` input: the release config is injected at
  build time from the repo variables `API_BASE_URL` / `GOOGLE_CLIENT_ID` /
  `EXTENSION_PUBLIC_KEY`, and the canon fails the run when any is unset rather than shipping a
  dev-pointed zip.
- Daily bump/filter commands (dependency-free): `client/scripts/bump-patch-version.mjs` /
  `client/scripts/filter-shipped-paths.mjs`.
- Privacy page: [`store_artifacts/PRIVACY.md`](store_artifacts/PRIVACY.md) at
  `https://missingbulb.github.io/TLDR/privacy/`.
- The four store secrets are the standard names — minting them is "Minting the API credentials"
  in the canon release guide.

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
