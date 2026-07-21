# TLDR — Dev in its own AWS account (multi-account split)

**Goal:** give this repo's Claude sandbox **full power over the dev environment** and **structurally zero
reach into production**, while the GitHub Actions deploy role stays the trusted mutator of prod. The clean
way to make "zero prod reach" *literally* true is to put dev in its **own AWS account** — the account is the
strongest isolation boundary AWS offers.

> **Why a separate account (not just IAM in one account).** In a single account, prod and dev are separated
> only by resource names, and IAM name-scoping leaks in specific services:
> - **API Gateway** — HTTP API IDs are random (`.../apis/{random}`), not name-prefixed, so you can't scope to
>   "dev"; granting `apigateway:*` on `/apis/*` reaches the **prod** API.
> - **Shared SAM S3 bucket** — prod and dev deploys upload to the same `aws-sam-cli-managed-default-*` bucket.
> - **IAM escalation surface** — any IAM-write power the sandbox holds is a path to broaden itself.
> - **Account-wide quotas / cost** — a runaway dev process can exhaust shared limits or run up a bill, which
>   degrades prod indirectly; no IAM policy fences this.
>
> A separate account removes all four: the dev account simply **contains no prod ARNs**, so there is nothing to
> reach and nothing to deny. This is AWS's flagship recommendation — Well-Architected **SEC01-BP01 "Separate
> workloads using accounts"**, the *Organizing Your AWS Environment Using Multiple Accounts* whitepaper, and the
> AWS Organizations best-practices guide all say: isolate prod from dev/test at the **account** level.

Region stays **`il-central-1`** (as prod). Prod account = **`665911299748`**; the new dev account id is
**`605599552045`** (recorded in Phase A — where policy JSON below says `<DEV_ACCOUNT_ID>`, that's this). Repo = **`missingbulb/TLDR`** (canonical casing — matters for OIDC).

---

## Who does what

| Phase | Who | Why |
|---|---|---|
| A — Org + OU + dev account | **Owner** (Organizations *management* account) | Only the management account can create accounts / OUs / SCPs. |
| B — dev-account OIDC deploy role (CI) | **Owner** (admin in the dev account) | Bootstraps the trust that lets CI deploy dev. |
| C — dev-account Claude sandbox principal | **Owner** (admin in the dev account) | Mints the key that goes into this environment. |
| D — SCP guardrail on the non-prod OU | **Owner** (management account) | Caps blast radius even for the dev admin. |
| E — repo wiring + first dev deploy | **Claude** (repo) → then CI/Claude (deploy) | The `deploy.yml`/variable change ships in this PR; the deploy runs once B/E are wired. |
| F — decommission old in-prod-account dev stack | **Claude** via CI, or owner in console | Removes the broken `tldr-app-dev` cruft from the **prod** account. |

This environment's `AWS_*` creds are currently **invalid** (`InvalidClientTokenId`) — Phase C replaces them.
Egress to AWS from here already works (the failed call reached AWS and got a signed auth error), so once a
valid dev key lands, Claude can operate the dev account directly.

---

## Phase A — Organizations + OU + dev account  *(owner, management account)*

- [ ] **A.1** In the **management** account: **AWS Organizations → enable** if not already. Enable **All
  features** (Settings) — required for SCPs; consolidated-billing-only is not enough.
- [ ] **A.2** Create an OU layout (Organizations → **Organize accounts → Root → Actions → Create new OU**):
  - `Workloads/Prod` — move the existing prod account (`665911299748`) here.
  - `Workloads/NonProd` — the dev account (next step) goes here.
- [ ] **A.3** **Create the dev account** (Organizations → **Add an AWS account → Create**): name e.g.
  `tldr-dev`, a unique email, place it in `Workloads/NonProd`. Record the 12-digit id → **`<DEV_ACCOUNT_ID>`**.
- [ ] **A.4** In the dev account, **enable the `il-central-1` region** (it's opt-in) and set up an admin IAM
  identity to do the console work in B–C (don't use the account root). Access is via the
  `OrganizationAccountAccessRole` that Organizations creates, or IAM Identity Center.

---

## Phase B — Dev-account OIDC deploy role (so CI keeps deploying dev)  *(owner, dev account)*

Mirrors the prod setup (`server/README.md` §2) but in the **dev** account. GitHub OIDC works per-account, so CI
assumes this role directly for dev — no cross-account role chaining.

- [ ] **B.1 IAM → Identity providers → Add provider → OpenID Connect:** URL
  `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
- [ ] **B.2 IAM → Roles → Create role → Custom trust policy** → name it `tldr-github-deploy`, paste (fill in
  `<DEV_ACCOUNT_ID>`):

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::<DEV_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": [
            "repo:missingbulb/TLDR:ref:refs/heads/main",
            "repo:missingbulb/tldr:ref:refs/heads/main"
          ]
        }
      }
    }]
  }
  ```
  > ⚠️ **Casing matters** — GitHub's `sub` claim uses the repo's canonical casing and IAM `StringEquals` is
  > case-sensitive; listing both casings avoids a silent `Not authorized to perform sts:AssumeRoleWithWebIdentity`.

- [ ] **B.3 Attach this inline permissions policy.** It is the prod policy from `server/README.md` §2.3 with the
  dev account id, minus the prod-only `tldr-comments` table (which doesn't exist here). `tldr-app-*` already
  covers the dev stack's table (`tldr-app-dev-comments`), Lambda, logs and exec role.

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      { "Sid": "CloudFormation", "Effect": "Allow", "Action": "cloudformation:*", "Resource": "*" },
      { "Sid": "Sts", "Effect": "Allow", "Action": "sts:GetCallerIdentity", "Resource": "*" },
      { "Sid": "SamBucket", "Effect": "Allow", "Action": "s3:*", "Resource": [
        "arn:aws:s3:::aws-sam-cli-managed-default*", "arn:aws:s3:::aws-sam-cli-managed-default*/*" ] },
      { "Sid": "Lambda", "Effect": "Allow", "Action": "lambda:*",
        "Resource": "arn:aws:lambda:il-central-1:<DEV_ACCOUNT_ID>:function:tldr-app-*" },
      { "Sid": "ApiGateway", "Effect": "Allow", "Action": "apigateway:*",
        "Resource": "arn:aws:apigateway:il-central-1::*" },
      { "Sid": "DynamoDB", "Effect": "Allow", "Action": "dynamodb:*", "Resource": [
        "arn:aws:dynamodb:il-central-1:<DEV_ACCOUNT_ID>:table/tldr-app-*",
        "arn:aws:dynamodb:il-central-1:<DEV_ACCOUNT_ID>:table/tldr-app-*/*" ] },
      { "Sid": "Logs", "Effect": "Allow", "Action": "logs:*", "Resource": [
        "arn:aws:logs:il-central-1:<DEV_ACCOUNT_ID>:log-group:/aws/lambda/tldr-app-*",
        "arn:aws:logs:il-central-1:<DEV_ACCOUNT_ID>:log-group:/aws/lambda/tldr-app-*:*" ] },
      { "Sid": "IamExecRole", "Effect": "Allow", "Action": "iam:*",
        "Resource": "arn:aws:iam::<DEV_ACCOUNT_ID>:role/tldr-app-*" }
    ]
  }
  ```
- [ ] **B.4** Copy the role ARN → **`<AWS_DEV_DEPLOY_ROLE_ARN>`** (used in Phase E).

---

## Phase C — Dev-account Claude sandbox principal (the key for this environment)  *(owner, dev account)*

The dev account **is** the boundary, so the sandbox can hold broad power *inside it* — capped by the Phase-D
SCP. This environment consumes static `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, so the simplest fit is an
IAM **user** with an access key.

- [ ] **C.1 IAM → Users → Create user** `tldr-claude-sandbox` (no console access).
- [ ] **C.2** Attach the AWS-managed **`AdministratorAccess`** policy. (Full power in dev; the SCP is the outer
  cap. Scoping it further inside a dedicated sandbox account buys little and just gets in Claude's way.)
- [ ] **C.3 Create an access key** (use case: "Application running outside AWS") → record the id + secret.
- [ ] **C.4** Put the key into **this environment's config** as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  (replacing the current invalid pair), region `il-central-1`. Rotate periodically; revoke to instantly cut
  Claude's dev access.

  > **Hardening option (skip unless you want it):** instead of admin-on-the-user, create a role
  > `tldr-claude-sandbox` with `AdministratorAccess` and give the *user* only `sts:AssumeRole` on it — Claude
  > assumes the role for short-lived session creds. More moving parts; the SCP already bounds the blast radius.

---

## Phase D — SCP guardrail on the non-prod OU  *(owner, management account; optional but recommended)*

An SCP is a ceiling the dev admin **cannot** exceed. SCPs only *restrict* (never grant), and never apply to the
management account. A sensible starter — region-lock + block org/account tampering:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideIlCentral1",
      "Effect": "Deny",
      "NotAction": [
        "iam:*", "sts:*", "organizations:*", "account:*", "support:*", "budgets:*",
        "route53:*", "waf:*", "wafv2:*", "shield:*", "globalaccelerator:*"
      ],
      "Resource": "*",
      "Condition": { "StringNotEquals": { "aws:RequestedRegion": "il-central-1" } }
    },
    {
      "Sid": "DenyOrgAndAccountTampering",
      "Effect": "Deny",
      "Action": [
        "organizations:LeaveOrganization",
        "account:CloseAccount",
        "account:PutAlternateContact",
        "account:DeleteAlternateContact"
      ],
      "Resource": "*"
    }
  ]
}
```
- The `NotAction` list allowlists **global** services (IAM, STS, Route 53, …) so the region lock
  doesn't break them — they operate in `us-east-1`/`aws-global`. IAM/STS staying allowed is what lets the OIDC
  deploy and the exec-role management work.
- Tune as you like (e.g. also deny expensive services you'll never use in dev). Attach to `Workloads/NonProd`.

---

## Phase E — Repo wiring + first dev deploy  *(Claude ships the code; then deploy)*

Shipped in this PR:
- **`deploy.yml`** resolves the deploy role **per environment**: `prod` → `AWS_DEPLOY_ROLE_ARN` (prod account),
  `dev` → **`AWS_DEV_DEPLOY_ROLE_ARN`** (dev account). Until `AWS_DEV_DEPLOY_ROLE_ARN` is set it **falls back**
  to `AWS_DEPLOY_ROLE_ARN`, so nothing changes before the dev account exists.
- `samconfig.toml` / `architecture.md` / `server/README.md` note the split.

Owner, after Phase B:
- [x] **E.1** GitHub → **Settings → Secrets and variables → Actions → Variables** → add
  `AWS_DEV_DEPLOY_ROLE_ARN` = `<AWS_DEV_DEPLOY_ROLE_ARN>` (from B.4). `GOOGLE_CLIENT_ID` and the
  `EMAIL_HASH_SALT` secret are reused for dev (same OAuth app; the salt can be shared).
- [x] **E.2** Trigger a dev deploy: push a server change to `main` (auto), or **Actions → deploy → Run
  workflow → environment: dev**. It creates `tldr-app-dev` **in the dev account**, fresh — no `ROLLBACK_COMPLETE`
  history to clean up. Record the `ApiUrl` output.
  *Done 2026-07-05: clean `CREATE` of `tldr-app-dev` in `605599552045` (the #54-merge auto-deploy created it;
  a follow-up `workflow_dispatch environment: dev` updated it). `ApiUrl` =
  `https://x9yiwjm735.execute-api.il-central-1.amazonaws.com`; smoke test `GET /comments?pageUrl=…` → `200 {"comments":[]}`.*
- [x] **E.3** Point the dev extension build (`npm run build:dev`) at the new dev `ApiUrl`.
  *Done: the committed default `API_BASE_URL` in `extension/config.mjs` (what `build:dev`/unpacked builds use
  when no `API_BASE_URL_DEV`/`API_BASE_URL` env is set) now carries this `ApiUrl`.*

---

## Phase F — Decommission the old in-prod-account dev stack  *(cleanup)*

The broken `tldr-app-dev` stack (in `ROLLBACK_COMPLETE`) still sits in the **prod** account. Remove it so no dev
cruft remains in prod:
- [x] **F.1** Delete stack `tldr-app-dev` in account `665911299748` (CloudFormation console, or a one-shot CI
  `aws cloudformation delete-stack`). The `Retain` table `tldr-app-dev-comments` survives as an orphan (empty) —
  delete it by hand if you want it gone.
  *Done 2026-07-05 (owner, console). No orphan table existed — the failed CREATE rolled back before the
  table resource was created, so there was nothing retained. Prod holds no dev cruft.*
- [ ] **F.2 (optional)** Tighten the **prod** deploy role: now that no dev stack lives in the prod account, its
  `tldr-app-*` wildcards (DynamoDB/Lambda/logs/IAM) can be narrowed to prod's exact names. Not required.

---

## Result

- **Dev** lives in `605599552045`; Claude has admin there (SCP-capped), CI deploys it via the dev-account
  OIDC role. Full create/delete/rollback power.
- **Prod** lives in `665911299748`; the only thing that touches it is the prod-account GitHub deploy role. The
  dev account holds **no prod ARNs** — zero reach, structurally, not just by policy.
