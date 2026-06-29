# TLDR

Get community-generated tl;dr notes for any link on the web — a Chrome extension where signed-in users
read and post short notes ("comments") attached to any page, keyed by its normalized URL.

This is a monorepo with an AWS backend and an MV3 Chrome extension, wired together by a single shared
URL-normalization rule.

## Layout
| Path | What |
|------|------|
| [`shared/`](shared/normalizeUrl.mjs) | The single source of truth for URL → `pageId` normalization (vendored into both sides, drift-guarded); `shared/test/` holds its corpus test. |
| [`server/`](server/README.md) | Everything AWS: HTTP API + Google JWT authorizer, one Lambda, DynamoDB, CloudFront. Two CloudFormation stacks. |
| [`client/`](client/README.md) | The MV3 Chrome extension (side panel, no bundler). |
| [`dev/requirements/`](dev/requirements/README.md) | The executable-requirements suite (client UI + server), spanning both apps. |
| [`dev/docs/`](dev/docs/architecture.md) | The as-built [architecture](dev/docs/architecture.md) + the portable [UI-testing guideline](dev/docs/ui-testing-guideline.md). |
| [`dev/build/tools/`](dev/build/tools/sync-shared.mjs) | Build tooling: the shared-code sync + its drift guard (`dev/build/tools/test/`). |
| `.github/workflows/` | CI (`server`, `client`, `requirements`), gated deploy (`deploy`), extension release (`release`, `publish-chrome-store`). |

## Architecture in one breath
Public, CDN-cached reads; authenticated writes. The client fetches only while the side panel is open,
for the active tab, and only on commentable pages. A comment is one DynamoDB item keyed by
`(pageId, ULID)`, so "all comments for a page" is a single-partition query that's usually a single
CloudFront edge lookup. See [`dev/docs/architecture.md`](dev/docs/architecture.md).

## Quickstart (owner setup)
> **Going live from zero?** Follow [`dev/docs/go-live-runbook.md`](dev/docs/go-live-runbook.md) — an action-by-action
> checklist from no AWS/Chrome-Store accounts to a published, working extension. The summary below is the
> five inputs it operationalizes.

The code is complete; bringing it live needs five owner-specific inputs (none can be defaulted):

1. **Google OAuth "Web application" client** → its client id. (`server/README.md` §1)
2. **AWS deploy role via GitHub OIDC** → set repo variable `AWS_DEPLOY_ROLE_ARN` (+ `GOOGLE_CLIENT_ID`). (`server/README.md` §2)
3. `cd server && sam build && sam deploy …`, then (prod) deploy the CDN stack. (`server/README.md` §3)
4. Set the client config as repo **variables** (`API_BASE_URL`, `GOOGLE_CLIENT_ID`, `EXTENSION_PUBLIC_KEY`) — the
   release build injects them into the zip; committed source stays placeholder. (`client/README.md`)
5. Release via the `release` workflow (bump the version on `main`) + `publish-chrome-store`. The zip is built in CI.

Open product/config questions are tracked in [`dev/docs/architecture.md`](dev/docs/architecture.md) §11.

## Develop & test
```bash
npm test                       # repo-level checks: URL-normalizer corpus + shared drift guard
npm --prefix server ci && npm --prefix server test
npm --prefix client test       # client unit + manifest/packaging guards (no deps)
npm --prefix dev ci && npm --prefix dev test           # the executable-requirements suite (UI + server)
```
No bundler, no linter — native `node --test` and `node --check`, matching the project's conventions.
The UI + server requirements are specified as executable requirements under
[`dev/requirements/`](dev/requirements/README.md); regenerate its rendered images with
`npm --prefix dev run refresh:ui` after an intentional panel change.
