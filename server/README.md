# TLDR server

Everything AWS. Two CloudFormation stacks:

| Stack | Template | What it holds | Churn |
|-------|----------|---------------|-------|
| **app** | `template.yaml` (SAM) | HTTP API v2 + Google JWT authorizer, one Lambda, DynamoDB table | high — deploy often |
| **cdn** | `cdn-template.yaml` (plain CFN) | CloudFront distribution + cache policy | low — ~15–20 min/deploy |

They're split so CloudFront's slow propagation never blocks Lambda iteration. The DynamoDB table lives in the app stack, protected by `Retain` + PITR.

The only code is `src/handler.mjs` (submit + read). It re-normalizes the URL with the vendored copy of the canonical `shared/normalizeUrl.mjs`, validates the body, reads verified JWT claims, and talks to DynamoDB.

## One-time setup

### 1. Google OAuth "Web application" client
The extension authenticates with a Google **ID token** (a JWT) obtained via `chrome.identity.launchWebAuthFlow`. That requires an OAuth client of type **Web application** (NOT "Chrome app" — that path yields an opaque *access* token the JWT authorizer can't validate).

1. Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → **Web application**.
2. Under **Authorized redirect URIs** add: `https://<EXTENSION_ID>.chromiumapp.org/`
   (the extension id is fixed by the `key` in `extension/manifest.json`; see `dev/docs/extension.md`).
3. Copy the **client id**. It is both the JWT authorizer `audience` (`GoogleClientId` param here) and the extension's `GOOGLE_CLIENT_ID` (`extension/config.mjs`).

### 2. GitHub → AWS deploy role (OIDC, no stored keys)
The deploy workflow assumes an IAM role via GitHub OIDC — no long-lived AWS keys anywhere.

> **Two accounts.** This section sets up the **prod** account's role (`AWS_DEPLOY_ROLE_ARN`). Dev lives in a
> **separate AWS account** with its own OIDC provider + deploy role (`AWS_DEV_DEPLOY_ROLE_ARN`) and a Claude
> sandbox principal — full setup and policy JSON in [`dev/docs/dev-account-runbook.md`](../dev/docs/dev-account-runbook.md).

1. Create the GitHub OIDC identity provider in IAM (once per account): provider URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
2. Create a role whose **trust policy** is scoped to this repo + branch:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
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

3. Attach this permissions policy — scoped to this stack's resources, **not** `AdministratorAccess`. `cloudformation` and `cloudfront` are granted at the service level (`Resource: "*"`) on purpose: change-set creation also authorizes against the SAM **transform** macro ARN (`…:aws:transform/Serverless-2016-10-31`) and the SAM-managed bucket stack, and CloudFront's policy/distribution ARNs aren't region-scoped. The data-plane resources stay tightly scoped — and because CloudFormation creates resources *using this same role*, those scopes still bound exactly what can be made:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Sid": "CloudFormation", "Effect": "Allow", "Action": "cloudformation:*", "Resource": "*" },
       { "Sid": "CloudFront", "Effect": "Allow", "Action": "cloudfront:*", "Resource": "*" },
       { "Sid": "Sts", "Effect": "Allow", "Action": "sts:GetCallerIdentity", "Resource": "*" },
       { "Sid": "SamBucket", "Effect": "Allow", "Action": "s3:*", "Resource": [
         "arn:aws:s3:::aws-sam-cli-managed-default*", "arn:aws:s3:::aws-sam-cli-managed-default*/*" ] },
       { "Sid": "Lambda", "Effect": "Allow", "Action": "lambda:*",
         "Resource": "arn:aws:lambda:il-central-1:<ACCOUNT_ID>:function:tldr-app-*" },
       { "Sid": "ApiGateway", "Effect": "Allow", "Action": "apigateway:*",
         "Resource": "arn:aws:apigateway:il-central-1::*" },
       { "Sid": "DynamoDB", "Effect": "Allow", "Action": "dynamodb:*", "Resource": [
         "arn:aws:dynamodb:il-central-1:<ACCOUNT_ID>:table/tldr-comments",
         "arn:aws:dynamodb:il-central-1:<ACCOUNT_ID>:table/tldr-comments/*",
         "arn:aws:dynamodb:il-central-1:<ACCOUNT_ID>:table/tldr-app-*",
         "arn:aws:dynamodb:il-central-1:<ACCOUNT_ID>:table/tldr-app-*/*" ] },
       { "Sid": "Logs", "Effect": "Allow", "Action": "logs:*", "Resource": [
         "arn:aws:logs:il-central-1:<ACCOUNT_ID>:log-group:/aws/lambda/tldr-app-*",
         "arn:aws:logs:il-central-1:<ACCOUNT_ID>:log-group:/aws/lambda/tldr-app-*:*" ] },
       { "Sid": "IamExecRole", "Effect": "Allow", "Action": "iam:*",
         "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/tldr-app-*" }
     ]
   }
   ```
4. In the GitHub repo: Settings → Secrets and variables → Actions → **Variables** → add `AWS_DEPLOY_ROLE_ARN` = the role ARN. (A repository *variable*, not a secret — the deploy job's `if:` reads it to stay *skipped* until it's set, instead of going red. The ARN is not sensitive.)

### 3. Deploy

```bash
cd server
npm ci   # esbuild is a (build-only) dependency so SAM's esbuild builder finds it; CI also adds it to PATH
sam build
sam deploy --parameter-overrides "GoogleClientId=<web-client-id> AllowedExtensionOrigin=* EmailHashSalt=<long-random-secret>"
```

`EmailHashSalt` (a `NoEcho` parameter) salts the stored one-way email hash used for moderation — set a long
random string. The CI deploy passes it from the secret `EMAIL_HASH_SALT` if present (see `deploy.yml`).
Note the `ApiUrl` / `ApiDomain` outputs.

> **CORS / `AllowedExtensionOrigin` must be `*`.** API Gateway HTTP API (v2) **rejects** the
> `chrome-extension://` scheme in its CORS `AllowOrigins` (`BadRequestException: "Invalid format for origin …"`),
> so you cannot lock CORS to the extension origin here. Use `*`. This is not a security regression: writes are
> gated by the Google JWT authorizer (POST only), and reads are public by design. The `*` is also what lets the
> extension reach the API under standard browser CORS, so it needs no `host_permissions`; the security boundary
> is the JWT authorizer, never browser CORS. (See `dev/docs/architecture.md` §6.3 / §12-A9 / §12-A10.)

**CDN (prod):**
```bash
sam deploy --config-env cdn --template cdn-template.yaml \
  --parameter-overrides "ApiDomain=<ApiDomain output> PriceClass=PriceClass_200"
```
Point the extension's `API_BASE_URL` at `https://<DistributionDomainName>`. (Skip this stack while iterating; in dev the extension can hit `ApiUrl` directly.)

### 4. Post-deploy hardening
Stack termination protection isn't expressible in the template body, so the **deploy workflow sets it
automatically** after each **prod** app-stack deploy (`aws cloudformation update-termination-protection`,
idempotent — see `deploy.yml`; dev skips it so the sandbox stays deletable). No manual step. For a
manual/local prod deploy, run it yourself once:
```bash
aws cloudformation update-termination-protection --enable-termination-protection \
  --stack-name tldr-app --region il-central-1
```
PITR is enabled in the template; you can confirm it in the DynamoDB console.

## Dev / sandbox environment

A second, isolated copy of the app stack so new versions can be exercised end-to-end **without
touching prod data**. Same AWS account, same region — but a distinct stack (`tldr-app-dev`) and,
critically, a distinct DynamoDB table (`tldr-app-dev-comments`), so a dev write can never land in prod.
**The environment is derived from the stack name, not a parameter:** the canonical `tldr-app` stack is
prod and its table is pinned in the template to `tldr-comments`; any other stack name (`tldr-app-dev`,
or an ad-hoc `tldr-app-<x>`) gets a stack-scoped table (`<stack>-comments`). Prod takes no environment
input, so nothing at deploy time can repoint it. There is **no dev CDN** — point the dev extension
build straight at the dev stack's `ApiUrl`.

**Promotion model.** A push to `main` with server changes **auto-deploys dev** (the always-current
sandbox) — every merged server change is immediately exercisable end-to-end. **Prod is never
automatic:** it's a deliberate manual promotion you run from the **deploy** workflow via *Run workflow*
→ `environment: prod`, once the change has been verified in dev. Both run from `main`, so the OIDC role
needs no trust-policy change.

**Deploy dev** — usually automatic on merge to `main`; to redeploy on demand, run the **deploy**
workflow with `environment: dev` (it skips termination protection so the stack stays deletable). Locally
it's the codified `dev` samconfig section (which just sets `stack_name = "tldr-app-dev"`):
```bash
sam build
sam deploy --config-env dev \
  --parameter-overrides "GoogleClientId=<web-client-id> AllowedExtensionOrigin=* EmailHashSalt=<secret>"
```
The dev stack reuses the **prod** Google OAuth Web client (simplest; the locked decision in #27).

**Build a dev extension.** The committed `extension/config.mjs` already defaults to dev, so a plain
`npm run build` (or loading `extension/` unpacked) talks to dev — never prod. To point at a specific dev
API without editing the committed default:
```bash
cd ../extension
API_BASE_URL_DEV="<dev stack ApiUrl output>" GOOGLE_CLIENT_ID="<web-client-id>" npm run build:dev
```
`build:dev` prefers `*_DEV` env vars (`API_BASE_URL_DEV`, `GOOGLE_CLIENT_ID_DEV`,
`EXTENSION_PUBLIC_KEY_DEV`), falling back to the committed default. Only the release pipeline injects
prod (see `dev/docs/extension.md`).

**Seed** the dev table with sample comments (dev-only; it refuses to target the prod table):
```bash
cd ../server
TABLE_NAME=tldr-app-dev-comments AWS_REGION=il-central-1 node scripts/seed-dev.mjs
```

**Teardown**: `sam delete --config-env dev`. Because the table is `Retain`, it survives as an orphan
(`DELETE_SKIPPED`) — delete `tldr-app-dev-comments` by hand if you want it gone.

> The deploy role's IAM policy scopes DynamoDB to prod's exact `table/tldr-comments` plus
> `table/tldr-app-*` (which covers `tldr-app-dev-comments` and any ad-hoc `tldr-app-<x>-comments`).
> `tldr-app-*` already covers the dev stack's Lambda/Logs/IAM roles too.

## Deploy discipline
- **Review every changeset** (`confirm_changeset = true` in `samconfig.toml`). `Replacement: True` on `CommentsTable` is a **hard stop** — replacement makes a new empty table and the data does not follow. The frozen attributes are `KeySchema` and `AttributeDefinitions`.
- Stateless resources (API, authorizer, Lambda, CloudFront) are disposable; the table is the one stateful resource.

## Abuse controls (v1)
- **Per-author rate limit**: a TTL'd DynamoDB counter caps comments/author/minute (`RateLimitPerMinute`, default 10) — the real per-user control.
- **Body cap**: `MaxBodyBytes` (default 8 KB) → 413.
- **Verified email required** for writes (`email_verified` claim).
- Edge/stage throttling and reserved concurrency are intentionally **not** set in v1 (reserved concurrency can fail a new account's deploy when its concurrency limit is low). Add API Gateway stage `RouteSettings` once the account's limits are known — see the §10 fast-follow in `dev/docs/architecture.md`.

## Tests
`npm test` — handler logic with DynamoDB mocked at the SDK boundary (`aws-sdk-client-mock`).
