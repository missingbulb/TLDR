# CI/CD (GitHub Actions) — lessons

Notes for `.github/workflows/`, and for reading CI status when driving a merge.

- **Gate an optional job on a repo *variable*, not a secret.** `secrets.*` are not available in a job-level
  `if:`, so a job gated on a secret can't evaluate its condition and **fails (red)** instead of skipping. Put
  a non-sensitive flag (e.g. a deploy role ARN) in a repository **variable** and gate with
  `if: ${{ vars.X != '' }}` so the job is **skipped (neutral)** until it's configured — keeping the default
  branch green for anyone who hasn't set the integration up. Reserve secrets for the values consumed *inside*
  the job's steps. Worked example: `.github/workflows/deploy.yml`
  (`if: ${{ vars.AWS_DEPLOY_ROLE_ARN != '' && vars.GOOGLE_CLIENT_ID != '' }}`).
- **To read a PR's CI status via the GitHub MCP, use the PR-scoped check call
  (`pull_request_read` with `get_check_runs`), *not* the workflow-run listing tools
  (`actions_list` / `actions_get`).** The listing tools return the whole run/repo payload
  and overflow the context window; the PR-scoped call returns just that PR's per-check
  verdicts, which is all a merge gate needs. (Hit while polling the requirements PRs to
  confirm green before merge — the listing tools overflowed; `get_check_runs` was the fix.)
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
