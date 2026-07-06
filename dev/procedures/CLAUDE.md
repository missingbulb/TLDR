# TLDR — local project guidance

Project-specific guidance and lessons learned **in this repo**, layered on top of the shared Claudinite
corpus (`.claudinite/`). Where a local rule refines a corpus rule, the local one wins — it carries this
project's concrete files and gotchas. Routing index, not a payload: read the matching doc when its
trigger fires; don't pre-load.

> Lessons are captured **here, locally, first** — with worked examples pointing at this repo's files.
> Propagating a *portable* lesson up to the shared Claudinite corpus is a **separate** task (the
> `claudinite-lesson` handoff) and is not part of writing the lesson down here.

## Project reference

- [architecture & decision log](../../docs/architecture.md) — the as-built backend (SAM + CloudFront) + MV3 extension + CI/CD design, with the decision rationale.
- [releasing & store publication](../build/release/releasing.md) — this repo's instance of the shared chrome-extension-release standard (the canon guide owns the cross-repo contract and manual store procedures); the zero-to-live sequence is the [go-live runbook](../docs/go-live-runbook.md). Read **only** when cutting/publishing a release or touching the release workflows.

## Lessons — read the matching one before working in that area

- [chrome-extension.md](chrome-extension.md) — **before touching `client/`.** MV3 Google ID-token auth (`launchWebAuthFlow`, not `getAuthToken`), ES-modules-without-a-bundler, the silent-refresh `prompt`, and why the API is reached via the server's `*` CORS, not `host_permissions`.
- [aws-sam.md](aws-sam.md) — **before touching `server/` templates or the build.** The SAM esbuild Handler-path and esbuild-dependency traps, and CloudFront's `Authorization` / cache-key rules; the deploy role's IAM scope (the Serverless-transform + CloudFront grants); the new-account CloudFront-verification gate; and failed-`CREATE` cleanup (`ROLLBACK_COMPLETE` + orphaned `Retain` resources).
- [ci-cd.md](ci-cd.md) — **before editing `.github/workflows/`, or when reading CI status to gate a merge.** Gating an optional job (e.g. deploy) so it skips cleanly instead of failing red; reading a PR's check state with the PR-scoped MCP call instead of the context-overflowing workflow-run listing tools; the case-sensitive OIDC `sub` trust-policy match; reading run state via the MCP tools (not `curl`) plus a read-only status workflow; and why workflow/build changes only take effect once on the default branch.
- [testing.md](testing.md) — **before writing or changing a test under `client/`, `server/`, or `dev/requirements/`.** Repo-specific testing gotchas layered on the corpus testing practices — e.g. the client's `chrome.*` surface is faked in two independent doubles (the `client/test` stub and the `dev/requirements` real-module harness), so a new `chrome.*` call must teach both or it fails far away as a snapshot pixel-diff.
