# TLDR

Get community-generated tl;dr notes for any link on the web — a Chrome extension where signed-in users
read and post short notes ("comments") attached to any page, keyed by its normalized URL.

This is a monorepo with an AWS backend and an MV3 Chrome extension, wired together by a single shared
URL-normalization rule.

## Layout
| Path | What |
|------|------|
| [`shared/normalizeUrl.mjs`](shared/normalizeUrl.mjs) | The single source of truth for URL → `pageId` normalization (vendored into both sides, drift-guarded). |
| [`server/`](server/README.md) | Everything AWS: HTTP API + Google JWT authorizer, one Lambda, DynamoDB, CloudFront. Two CloudFormation stacks. |
| [`client/`](client/README.md) | The MV3 Chrome extension (side panel, no bundler). |
| [`docs/architecture.md`](docs/architecture.md) | The as-built architecture and the decision log. |
| `.github/workflows/` | CI (`server`, `client`), gated deploy (`deploy`), extension release (`release`, `publish-chrome-store`). |

## Architecture in one breath
Public, CDN-cached reads; authenticated writes. The client fetches only while the side panel is open,
for the active tab, and only on commentable pages. A comment is one DynamoDB item keyed by
`(pageId, ULID)`, so "all comments for a page" is a single-partition query that's usually a single
CloudFront edge lookup. See [`docs/architecture.md`](docs/architecture.md).

## Quickstart (owner setup)
> **Going live from zero?** Follow [`docs/go-live-runbook.md`](docs/go-live-runbook.md) — an action-by-action
> checklist from no AWS/Chrome-Store accounts to a published, working extension. The summary below is the
> five inputs it operationalizes.

The code is complete; bringing it live needs five owner-specific inputs (none can be defaulted):

1. **Google OAuth "Web application" client** → its client id. (`server/README.md` §1)
2. **AWS deploy role via GitHub OIDC** → set repo variable `AWS_DEPLOY_ROLE_ARN` (+ `GOOGLE_CLIENT_ID`). (`server/README.md` §2)
3. `cd server && sam build && sam deploy …`, then (prod) deploy the CDN stack. (`server/README.md` §3)
4. Set the client config as repo **variables** (`API_BASE_URL`, `GOOGLE_CLIENT_ID`, `EXTENSION_PUBLIC_KEY`) — the
   release build injects them into the zip; committed source stays placeholder. (`client/README.md`)
5. Release via the `release` workflow (bump the version on `main`) + `publish-chrome-store`. The zip is built in CI.

Open product/config questions are tracked in [`docs/architecture.md`](docs/architecture.md) §11.

## Develop & test
```bash
npm test                       # cross-cutting: URL-normalizer corpus + shared drift guard
npm --prefix server ci && npm --prefix server test
npm --prefix client test
```
No bundler, no linter — native `node --test` and `node --check`, matching the project's conventions.
