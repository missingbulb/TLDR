# TLDR

Get community-generated tl;dr notes for any link on the web — a Chrome extension where signed-in users
read and post short notes ("comments") attached to any page, keyed by its normalized URL.

This is a monorepo with an AWS backend and an MV3 Chrome extension, wired together by a single shared
URL-normalization rule.

## Install

*Not yet on the Chrome Web Store — the listing goes live after the first manual publish (see
[dev/build/release/releasing.md](dev/build/release/releasing.md)).*

Or load the latest development build:

1. Download [the latest release zip](https://github.com/missingbulb/TLDR/releases/latest/download/tldr.zip)
   and extract it — it unpacks to a folder with `manifest.json` at its top. (Release zips are
   prod-pointed; a plain checkout is dev-pointed — see [`client/README.md`](client/README.md).)
2. Open `chrome://extensions`, enable **Developer mode** (top right), click
   **Load unpacked**, and select that folder.

## Releasing

The version users see is [`client/manifest.json`](client/manifest.json)'s `version`. Merging a
version bump to `main` cuts GitHub Release `vX.Y.Z` with `tldr.zip` attached, and the daily
auto-release ships shipped-file changes to the Chrome Web Store on its own (patch-bumping as
needed). Full procedure: [dev/build/release/releasing.md](dev/build/release/releasing.md).

## Layout
| Path | What |
|------|------|
| [`shared/`](shared/normalizeUrl.mjs) | The single source of truth for URL → `pageId` normalization (vendored into both sides, drift-guarded); `shared/test/` holds its corpus test. |
| [`server/`](server/README.md) | Everything AWS: HTTP API + Google JWT authorizer, one Lambda, DynamoDB, CloudFront. Two CloudFormation stacks. |
| [`client/`](client/README.md) | The MV3 Chrome extension (side panel, no bundler). |
| [`dev/requirements/`](dev/requirements/README.md) | The executable-requirements suite (client UI + server), spanning both apps. |
| [`dev/docs/`](dev/docs/architecture.md) | The as-built [architecture](dev/docs/architecture.md) + the portable [UI-testing guideline](dev/docs/ui-testing-guideline.md). |
| [`dev/build/tools/`](dev/build/tools/sync-shared.mjs) | Build tooling: the shared-code sync + its drift guard (`dev/build/tools/test/`). |
| `.github/workflows/` | CI (`server`, `client`, `requirements`), gated deploy (`deploy`), and the standard extension-release set (`release`, `publish-chrome-store`, `daily-release`, `deploy-privacy-page`, `report-failure`) — see [dev/build/release/releasing.md](dev/build/release/releasing.md). |

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
5. Release via **Release: Create Package** (bump the version on `main`) + **Release: Publish to
   Chrome Web Store**; once live, the daily auto-release ships changes on its own. The zip is
   built in CI ([dev/build/release/releasing.md](dev/build/release/releasing.md)).

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
