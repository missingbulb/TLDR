# TLDR — local project guidance

Project-specific guidance and lessons learned **in this repo**, layered on top of the shared Claudinite
corpus (`.claudinite/`). Where a local rule refines a corpus rule, the local one wins — it carries this
project's concrete files and gotchas. Routing index, not a payload: read the matching doc when its
trigger fires; don't pre-load.

> Lessons are captured **here, locally, first** — with worked examples pointing at this repo's files.
> Propagating a *portable* lesson up to the shared Claudinite corpus is a **separate** task (the
> `claudinite-lesson` handoff) and is not part of writing the lesson down here.

## Project reference

- [architecture & decision log](../docs/architecture.md) — the as-built backend (SAM + CloudFront) + MV3 extension + CI/CD design, with the decision rationale.
- releasing & store publication — this repo's instance of the shared chrome-extension-release standard (the canon guide in Claudinite owns the cross-repo contract and manual store procedures). Read **only** when cutting/publishing a release or touching the release workflows.

## Lessons — read the matching one before working in that area

- [chrome-extension.md](chrome-extension.md) — **before touching `extension/`.** The multi-account silent-refresh `login_hint`, the interactive-auth escalation guard, why the API is reached via the server's `*` CORS (not `host_permissions`), and opt-in real host access via `optional_host_permissions` + dynamic content-script registration.
- [aws-sam.md](aws-sam.md) — **before touching `server/` templates or the build.** The deploy role's IAM scope (the Serverless-transform + CloudFront grants); the new-account CloudFront-verification gate; and failed-`CREATE` cleanup (`ROLLBACK_COMPLETE` + orphaned `Retain` resources).
- [ci-cd.md](ci-cd.md) — **before editing `.github/workflows/`, or when reading CI status to gate a merge.** The case-sensitive OIDC `sub` trust-policy match; reading run state via the MCP tools (not `curl`) plus a read-only status workflow; and why workflow/build changes only take effect once on the default branch.
