# AWS SAM + CloudFront — lessons

Notes for the `server/` backend: the SAM app stack (`template.yaml`) and the CloudFront CDN stack
(`cdn-template.yaml`). Portable subsets would propagate to the corpus separately.

- **To talk to AWS from a session, use the AWS CLI (or a boto3 script) — there is no Claude/MCP tool for AWS.**
  The only connected MCP server is GitHub; a tool search for AWS turns up nothing. So checking a stack's real
  state is a plain CLI call, e.g. `aws cloudformation describe-stacks --stack-name tldr-app-dev --region
  il-central-1 --query "Stacks[0].StackStatus"` (dev stack is `tldr-app-dev`, prod is `tldr-app`; dev and prod
  live in separate accounts — see `dev/docs/dev-account-runbook.md` for the account/role details). This is the
  authoritative live status — the last-green
  `deploy.yml` run only tells you the last *deploy*, not the current stack state. The `.github/workflows/aws-status.yml`
  workflow is a read-only alternative but describes only `tldr-app`/`tldr-cdn` by name, so it won't target
  `tldr-app-dev` directly. Portable subset for the corpus (`claudinite-lesson` handoff): *AWS access is CLI/boto3,
  not an MCP tool.*

- **The AWS CLI is not pre-installed on the web/cloud runner — declare it in the environment setup script.**
  Cloud sessions start without `aws` (and without `boto3`/`sam`) on PATH, so a stack-status check needs a
  one-time install first: `pip install awscli` (a few seconds) or the official
  `awscli-exe-linux-x86_64.zip` bundle. The durable fix is one line in the **environment's setup script**
  (Claude Code on the web config — *not* a repo file; the `.claude/settings.json` `SessionStart` hooks here only
  sync Claudinite). Dev-account credentials (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`)
  and `AWS_CA_BUNDLE=/root/.ccr/ca-bundle.crt` (so the CLI trusts the agent proxy) are already present in the
  env. Portable subset for the corpus (`claudinite-lesson` handoff): *pre-install the AWS CLI via the environment
  setup script; it is absent by default.*
