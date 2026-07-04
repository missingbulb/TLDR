# TLDR — working instructions

The single entry point for *working in this repo*: the project's category, the map of where each kind
of work happens (and which doc to read first), the invariants that hold everywhere, and the
build/test/deploy/release mechanics. Routing-style on purpose — it links the doc that owns each topic
instead of restating it, so there is one source of truth per topic and nothing here to drift.

> **🌱 Seeds a new Claudinite category template.** This doc was generated per the
> `generate-project-instructions` flow, which links a matching category template from
> `.claudinite/templates/` when one exists. **None exists yet** (the corpus has no `templates/`
> directory at the time of writing), so this doc is authored from the project directly and is the
> candidate seed for the category's template. When the upstream template lands, link it here and
> reconcile the structure against it.

## Project category

**Chrome MV3 extension + AWS serverless backend monorepo.** Concretely, the traits that drive how you
work here:

- **Client:** an MV3 Chrome extension (side panel), plain ES modules — **no bundler, no linter**.
- **Server:** AWS serverless — SAM app stack (HTTP API v2 + JWT authorizer + one Lambda + DynamoDB)
  plus a separate plain-CFN CloudFront stack; infrastructure-as-code from the first resource.
- **Shared code:** a canonical `shared/` vendored **byte-identically** into both sides, drift-guarded.
- **Testing:** native `node --test` everywhere, plus a cross-tier executable-requirements suite.
- **CI/CD:** GitHub Actions — path-filtered CI, OIDC-authenticated gated deploy, store-release flow.

Corpus technology docs that apply: [Node.js](../../.claudinite/technologies/nodejs.md) ·
[Chrome extension](../../.claudinite/technologies/chrome-extension.md) ·
[HTML](../../.claudinite/technologies/html.md).

## What this project is

Community tl;dr notes for any web page: signed-in users read and post short notes attached to a page,
keyed by its normalized URL. Public CDN-cached reads, authenticated writes. The one-paragraph tour is
in the [root README](../../README.md); the full as-built design and every decision's rationale is the
[architecture & decision log](../docs/architecture.md).

## The map — where work happens, and what to read first

| Working on | Lives in | Read first |
|---|---|---|
| Extension UI / auth / client logic | `client/` | [chrome-extension.md](chrome-extension.md), then [`client/README.md`](../../client/README.md) |
| Lambda handler, SAM/CFN templates, deploy | `server/` | [aws-sam.md](aws-sam.md), then [`server/README.md`](../../server/README.md) |
| URL normalization or the category taxonomy | `shared/` | The shared-code invariant below — edit the canonical file, never a vendored copy |
| Any test | `client/test`, `server/test`, `dev/requirements/` | [testing.md](testing.md) (the two-`chrome.*`-doubles gotcha), then [`dev/requirements/README.md`](../requirements/README.md) for the requirements suite |
| Workflows, CI status, releases | `.github/workflows/` | [ci-cd.md](ci-cd.md) |
| The wire contract (request/response shapes) | `server/src/handler.mjs` + `client/src/api.mjs` | Architecture [§9.1](../docs/architecture.md) — the additive-only policy |

## Invariants — hold everywhere, regardless of the area

- **`shared/` is the single source of truth.** `normalizeUrl.mjs` and `categories.mjs` are vendored
  byte-identically into `server/` and `client/` as `*.GENERATED.mjs` by `npm run sync-shared` (root),
  with a CI drift guard (`dev/build/tools/test/`). Edit the canonical file, re-sync, and never
  hand-edit a `GENERATED` file — divergent copies are silent data loss (client writes under `pageId`
  A, reads look under B).
- **The API contract evolves additively only** — new fields/params are optional with server-side
  defaults; read-projection fields are never removed or renamed ([§9.1](../docs/architecture.md)).
  Old store-installed clients call new servers for a long time.
- **Requirements expecteds are owner-owned.** In `dev/requirements/`, never edit a committed expected
  (image or assertion) to turn a red case green — surface actual vs expected and ask
  ([the contract](../requirements/README.md)).
- **The committed client config points at dev, never prod.** Only the release workflow injects the
  prod URL; a local/unpacked/`build:dev` build always talks to the dev stack (guarded by a test).
- **DynamoDB key schema is frozen.** `Replacement: True` on the table in a changeset is a hard stop —
  data does not follow a replaced table ([§5](../docs/architecture.md)).
- **No bundler, no linter — and keep it that way** unless a decision says otherwise: checks are
  `node --test` and `node --check`, so a "lint" failure you expect to exist probably doesn't.

## Build & test

```bash
npm test                       # root: URL-normalizer corpus + shared drift guard
npm --prefix server ci && npm --prefix server test
npm --prefix client test       # client unit + manifest/packaging guards (no deps)
npm --prefix dev ci && npm --prefix dev test   # executable-requirements suite (UI + server)
npm run test:all               # all of the above
```

- After an **intentional** panel/style change, regenerate the requirements gallery images with
  `npm --prefix dev run refresh:ui` — pixel diffs against stale goldens are otherwise expected.
- Client zip: `cd client && npm run build` (dev-pointed unless run by the release workflow). Load
  unpacked from `client/` for manual testing.
- Fresh checkout: each package installs independently (`npm ci` per prefix, as above); a
  `Cannot find module` on a clean clone means the install hasn't run, not a code bug.

## Deploy & release

- **Dev deploys automatically** on a `main` push touching `server/**`; **prod never does** — it's a
  manual `workflow_dispatch` promotion once verified in dev ([§8.5](../docs/architecture.md)).
- **Workflow/build changes only take effect once on `main`** — don't expect a PR branch to exercise
  an edited workflow ([ci-cd.md](ci-cd.md)).
- **Extension release:** bump the version on `main` → the `release` workflow builds the prod-injected
  zip → `publish-chrome-store` uploads it. The version bump is the owner's "bump version" command.
- Going live from zero (new account/owner setup): [`dev/docs/go-live-runbook.md`](../docs/go-live-runbook.md).

## Task workflow

The corpus lifecycle applies unchanged: issue → branch → PR
([task-lifecycle](../../.claudinite/always/task-lifecycle.md)), merged on the owner's "LGTM" per the
default recipe — squash, gated on this repo's CI
([merge-to-main](../../.claudinite/always/merge-to-main.md)). **This project has no bespoke merge
policy.** Lessons learned land in `dev/procedures/` first, per [CLAUDE.md](CLAUDE.md).
