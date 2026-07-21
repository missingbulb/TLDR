# TLDR — local project guidance

Project-specific guidance and lessons learned **in this repo**, layered on top of the shared Claudinite
corpus (vendored into the repo). Where a local rule refines a corpus rule, the local one wins — it carries this
project's concrete files and gotchas. Routing index, not a payload: read the matching doc when its
trigger fires; don't pre-load.

> Lessons are captured **here, locally, first** — with worked examples pointing at this repo's files.
> Propagating a *portable* lesson up to the shared Claudinite corpus is a **separate** task (the
> `claudinite-lesson` handoff) and is not part of writing the lesson down here.

## Project reference

- [working-instructions](working-instructions.md) — **start here.** The single entry-point for a fresh session/contributor: set up from a clean clone, run it / see a change work, verify (`npm run test:all`), propose a change, match the conventions, and hand off. Links out to everything below rather than restating it.
- [architecture & decision log](../docs/architecture.md) — the as-built backend (SAM) + MV3 extension + CI/CD design, with the decision rationale.
- releasing & store publication — this repo's instance of the shared chrome-extension-release standard (the canon guide in Claudinite owns the cross-repo contract and manual store procedures). Read **only** when cutting/publishing a release or touching the release workflows.

## Lessons — read the matching one before working in that area

- [chrome-extension.md](chrome-extension.md) — **before touching `extension/`.** The interactive-auth escalation guard, the toolbar-action open-or-close side-panel gating (Port + gated popup + right-click category menu), and the classic-injection ES-module trap for registered content scripts. (Portable subsets — the multi-account `login_hint`, reaching the API via the server's CORS not `host_permissions`, and opt-in host access via `optional_host_permissions` + dynamic registration — now live in the canon `chrome-extension` pack.)
- [aws-sam.md](aws-sam.md) — **before touching `server/` templates or the build.** AWS access is CLI/boto3, not an MCP tool (dev vs. prod stacks and accounts), and the AWS CLI is absent by default on the cloud runner (declare it in the environment setup script). (Portable subsets — the deploy role's transform grant and failed-`CREATE` cleanup — now live in the canon `aws-sam` pack.)
- [ci-cd.md](ci-cd.md) — **before editing `.github/workflows/`, or when reading CI status to gate a merge.** Reading run state via the MCP tools (not `curl`, which the proxy blocks) — the non-PR `get_job_logs` path plus a read-only AWS status workflow. (Portable subsets — the case-sensitive OIDC `sub` match and why a workflow/build change only takes effect once on the default branch — now live in the canon `git-github-advanced` skill.)
