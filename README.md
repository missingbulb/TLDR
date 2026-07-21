# TLDR

Get community-generated tl;dr notes for any link on the web — a Chrome extension where signed-in users
read and post short notes ("comments") attached to any page, keyed by its normalized URL.

This is a monorepo with an AWS backend and an MV3 Chrome extension, wired together by a single shared
URL-normalization rule.

## Install

**[Install from the Chrome Web Store →](https://chromewebstore.google.com/detail/tldr-%E2%80%94-community-notes/cgfkbaigkiccdpnmmbfmookalaombhil)**

Or load the latest development build:

1. Download [the latest release zip](https://github.com/missingbulb/TLDR/releases/latest/download/tldr.zip)
   and extract it — it unpacks to a folder with `manifest.json` at its top. (This download is
   dev-pointed, like a plain checkout; only the Chrome Web Store build is prod-pointed — see
   [`dev/docs/extension.md`](dev/docs/extension.md).)
2. Open `chrome://extensions`, enable **Developer mode** (top right), click
   **Load unpacked**, and select that folder.

## Releasing

The version users see is [`extension/manifest.json`](extension/manifest.json)'s `version`. Merging a
version bump to `main` cuts GitHub Release `vX.Y.Z` with `tldr.zip` attached, and the daily
auto-release ships shipped-file changes to the Chrome Web Store on its own (patch-bumping as
needed).

## Layout
| Path | What |
|------|------|
| [`shared/`](shared/normalizeUrl.mjs) | The single source of truth for URL → `pageId` normalization (vendored into both sides, drift-guarded); `shared/test/` holds its corpus test. |
| [`server/`](server/README.md) | Everything AWS: HTTP API + Google JWT authorizer, one Lambda, DynamoDB. One CloudFormation stack. |
| [`extension/`](dev/docs/extension.md) | The MV3 Chrome extension (side panel, no bundler). |
| [`dev/requirements/`](dev/requirements/README.md) | The executable-requirements suite (client UI + server), spanning both apps. |
| [`dev/docs/`](dev/docs/architecture.md) | The as-built [architecture](dev/docs/architecture.md) + the portable [UI-testing guideline](dev/docs/ui-testing-guideline.md). |
| [`dev/build/tools/`](dev/build/tools/sync-shared.mjs) | Build tooling: the shared-code sync + its drift guard (`dev/build/tools/test/`). |
| `.github/workflows/` | CI (`server`, `extension`, `requirements`), gated deploy (`deploy`), and the single extension-release stub (`release`) whose jobs call the Claudinite canon reusable workflows (create-package, publish, daily; privacy-page deploy and failure reporting live in the canon). |

## Architecture in one breath
Public reads; authenticated writes. The client fetches only while the side panel is open,
for the active tab, and only on commentable pages. A comment is one DynamoDB item keyed by
`(pageId, ULID)`, so "all comments for a page" is a single-partition query. See
[`dev/docs/architecture.md`](dev/docs/architecture.md).

## Quickstart (owner setup)
The code is complete; bringing it live needs five owner-specific inputs (none can be defaulted):

1. **Google OAuth "Web application" client** → its client id. (`server/README.md` §1)
2. **AWS deploy role via GitHub OIDC** → set repo variable `AWS_DEPLOY_ROLE_ARN` (+ `GOOGLE_CLIENT_ID`). (`server/README.md` §2)
3. `cd server && sam build && sam deploy …`. (`server/README.md` §3)
4. Set the client config as repo **variables** (`API_BASE_URL`, `GOOGLE_CLIENT_ID`, `EXTENSION_PUBLIC_KEY`) — the
   release build injects them into the zip; committed source stays placeholder. (`dev/docs/extension.md`)
5. Release: bump the version on `main` (that runs the **create-package** job) + run the **Release**
   workflow with **mode: publish**; once live, the daily auto-release ships changes on its own. The
   zip is built in CI.

Open product/config questions are tracked in [`dev/docs/architecture.md`](dev/docs/architecture.md) §11.

## Develop & test
```bash
npm test                       # repo-level checks: URL-normalizer corpus + shared drift guard
npm --prefix server ci && npm --prefix server test
npm --prefix extension test    # extension unit + manifest/packaging guards (no deps)
npm --prefix dev ci && npm --prefix dev test           # the executable-requirements suite (UI + server)
```
No bundler, no linter — native `node --test` and `node --check`, matching the project's conventions.
The UI + server requirements are specified as executable requirements under
[`dev/requirements/`](dev/requirements/README.md); regenerate its rendered images with
`npm --prefix dev run refresh:ui` after an intentional panel change.
