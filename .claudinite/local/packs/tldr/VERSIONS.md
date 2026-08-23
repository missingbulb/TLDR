# Version history

Records for `.claudinite/local/packs/tldr`, one row per change an automatic run makes to this
pack — added going forward from the run that introduced this file; earlier changes are not
backfilled.

| Date | Task | What changed |
|---|---|---|
| 2026-08-23 | rule-revalidation | "A green release run is not evidence the store publish works" said `daily / check` short-circuits on a `ship_paths` diff against the last release tag. Reading `.github/workflows/chrome-extension-daily-release.yml` at HEAD shows the 2026-08-21 release-model overhaul replaced that check: it now short-circuits when the version already on `main` has a matching GitHub Release or git tag (`gh release view "v$version"` / `git rev-parse "v$version"`), with no `ship_paths` diff anywhere in the job. Corrected the sentence to the current mechanism (#336). |
