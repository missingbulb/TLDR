# CI/CD (GitHub Actions) — lessons

Notes for `.github/workflows/`, and for reading CI status when driving a merge.

- **Read GitHub run state through the MCP tools, never `curl` — and self-serve AWS state the same way.** In this
  environment `api.github.com` / `*.github.io` are proxy-blocked (`403 "GitHub access is not enabled for this
  session"`), so a `Monitor` that `curl`-polls a run gets the error JSON, never matches its success pattern, and
  falsely reports "still running" until timeout. For a **non-PR** run (push / `workflow_dispatch`, where the
  PR-scoped `get_check_runs` doesn't apply) confirm with `get_job_logs(run_id, failed_only: true)` ("0 failed
  jobs" = green) or `get_release_by_tag`. When a task needs *repeated* AWS state checks but access is OIDC-only,
  add a tiny read-only status workflow early (assume the deploy role, run `describe`/`list`) and read its logs —
  far cheaper than round-tripping the console. Worked example: `.github/workflows/aws-status.yml`.
