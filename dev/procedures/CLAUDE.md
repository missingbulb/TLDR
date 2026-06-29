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

## Lessons — read the matching one before working in that area

- [chrome-extension.md](chrome-extension.md) — **before touching `client/`.** MV3 Google ID-token auth (`launchWebAuthFlow`, not `getAuthToken`), ES-modules-without-a-bundler, the silent-refresh `prompt`, and why `host_permissions` doesn't remove server CORS.
- [aws-sam.md](aws-sam.md) — **before touching `server/` templates or the build.** The SAM esbuild Handler-path and esbuild-dependency traps, and CloudFront's `Authorization` / cache-key rules.
- [ci-cd.md](ci-cd.md) — **before editing `.github/workflows/`.** Gating an optional job (e.g. deploy) so it skips cleanly instead of failing red.
