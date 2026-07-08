# CI/CD (GitHub Actions) — lessons

Notes for `.github/workflows/`, and for reading CI status when driving a merge.

- **GitHub's OIDC `sub` uses the repo's *canonical* casing, and IAM `StringEquals` is case-sensitive.** A
  trust policy keyed on `repo:owner/repo:ref:refs/heads/main` with the wrong case (`tldr` when the repo is
  `TLDR`) fails the assume with a bare `Not authorized to perform sts:AssumeRoleWithWebIdentity` — no hint that
  casing is why. Match the exact canonical name, or list both casings in the `sub` array. Worked example: the
  trust policy in `server/README.md` §2.2.
- **Read GitHub run state through the MCP tools, never `curl` — and self-serve AWS state the same way.** In this
  environment `api.github.com` / `*.github.io` are proxy-blocked (`403 "GitHub access is not enabled for this
  session"`), so a `Monitor` that `curl`-polls a run gets the error JSON, never matches its success pattern, and
  falsely reports "still running" until timeout. For a **non-PR** run (push / `workflow_dispatch`, where the
  PR-scoped `get_check_runs` doesn't apply) confirm with `get_job_logs(run_id, failed_only: true)` ("0 failed
  jobs" = green) or `get_release_by_tag`. When a task needs *repeated* AWS state checks but access is OIDC-only,
  add a tiny read-only status workflow early (assume the deploy role, run `describe`/`list`) and read its logs —
  far cheaper than round-tripping the console. Worked example: `.github/workflows/aws-status.yml`.
- **A `workflow_dispatch` workflow — and anything a build depends on — only takes effect once on the default
  branch.** CI runs workflows from `main`: a dispatch-only workflow added on a feature branch isn't dispatchable,
  and `pull_request` runs use the *base* branch's definitions. So a release cut before its dependency lands on
  `main` runs the *old* build — e.g. shipping placeholder config because the build-time injection wasn't merged
  yet. Merge workflow/build changes before the release that needs them.
