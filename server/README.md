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
   (the extension id is fixed by the `key` in `client/manifest.json`; see `client/README.md`).
3. Copy the **client id**. It is both the JWT authorizer `audience` (`GoogleClientId` param here) and the extension's `GOOGLE_CLIENT_ID` (`client/config.mjs`).

### 2. GitHub → AWS deploy role (OIDC, no stored keys)
The deploy workflow assumes an IAM role via GitHub OIDC — no long-lived AWS keys anywhere.

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
           "token.actions.githubusercontent.com:sub": "repo:missingbulb/tldr:ref:refs/heads/main"
         }
       }
     }]
   }
   ```

3. Attach a **least-privilege** permissions policy (CloudFormation + the resource types this stack manages: `lambda`, `apigateway`, `dynamodb` scoped to the table, `logs`, `iam:*Role`/`PassRole` for the exec role, the SAM-managed S3 bucket). Do **not** use `AdministratorAccess`.
4. In the GitHub repo: Settings → Secrets and variables → Actions → **Variables** → add `AWS_DEPLOY_ROLE_ARN` = the role ARN. (A repository *variable*, not a secret — the deploy job's `if:` reads it to stay *skipped* until it's set, instead of going red. The ARN is not sensitive.)

### 3. Deploy

```bash
cd server
npm ci
sam build
sam deploy --parameter-overrides "GoogleClientId=<web-client-id> AllowedExtensionOrigin=chrome-extension://<ext-id> EmailHashSalt=<long-random-secret>"
```

`EmailHashSalt` (a `NoEcho` parameter) salts the stored one-way email hash used for moderation — set a long
random string. The CI deploy passes it from the secret `EMAIL_HASH_SALT` if present (see `deploy.yml`).
Note the `ApiUrl` / `ApiDomain` outputs.

**CDN (prod):**
```bash
sam deploy --config-env cdn --template cdn-template.yaml \
  --parameter-overrides "ApiDomain=<ApiDomain output> PriceClass=PriceClass_200"
```
Point the extension's `API_BASE_URL` at `https://<DistributionDomainName>`. (Skip this stack while iterating; in dev the extension can hit `ApiUrl` directly.)

### 4. Post-deploy hardening (one-time)
Stack termination protection isn't expressible in the template body — enable it once per stack:
```bash
aws cloudformation update-termination-protection --enable-termination-protection --stack-name tldr-app
```
Verify in the console that the table's **Point-in-time recovery** is on.

## Deploy discipline
- **Review every changeset** (`confirm_changeset = true` in `samconfig.toml`). `Replacement: True` on `CommentsTable` is a **hard stop** — replacement makes a new empty table and the data does not follow. The frozen attributes are `KeySchema` and `AttributeDefinitions`.
- Stateless resources (API, authorizer, Lambda, CloudFront) are disposable; the table is the one stateful resource.

## Abuse controls (v1)
- **Per-author rate limit**: a TTL'd DynamoDB counter caps comments/author/minute (`RateLimitPerMinute`, default 10) — the real per-user control.
- **Body cap**: `MaxBodyBytes` (default 8 KB) → 413.
- **Verified email required** for writes (`email_verified` claim).
- Edge/stage throttling and reserved concurrency are intentionally **not** set in v1 (reserved concurrency can fail a new account's deploy when its concurrency limit is low). Add API Gateway stage `RouteSettings` once the account's limits are known — see the §10 fast-follow in `docs/architecture.md`.

## Tests
`npm test` — handler logic with DynamoDB mocked at the SDK boundary (`aws-sdk-client-mock`).
