# TLDR — working instructions

The single entry-point for getting productive in this repo: set it up, change it, verify a change, and
ship it, without reverse-engineering the tree first. This is the **project-specific** layer — the
general working discipline (problem-first, the issue→branch→PR lifecycle, warnings-are-errors) is
auto-injected from the Claudinite corpus at session start (see [`.claudinite/CLAUDE.md`](../../.claudinite/CLAUDE.md));
this doc restates none of it and instead links where a rule already lives.

Routing index, not a payload: read the linked doc when its trigger fires. For the lessons that layer on
top of the technology packs, [`CLAUDE.md`](CLAUDE.md) in this folder is the router.

## What TLDR is

Community tl;dr notes for any web page: a signed-in user reads and posts short notes ("comments")
attached to a page, keyed by its normalized URL. It is a **monorepo** composing two deployable
artifacts joined by one shared rule:

- **`client/`** — an MV3 Chrome extension (side panel, no bundler; Chrome loads the ES modules directly). UI-facing.
- **`server/`** — an AWS serverless backend (SAM: HTTP API v2 + Google-JWT authorizer, one Lambda, DynamoDB) fronted by a CloudFront CDN. Two CloudFormation stacks (app + cdn).
- **`shared/`** — the single source of truth for URL→`pageId` normalization and category constants, vendored byte-identically into both sides and drift-guarded.

Trust boundary: **public, CDN-cached reads; authenticated writes** (Google ID token → JWT authorizer, POST only). The as-built design and every decision's rationale live in [`dev/docs/architecture.md`](../docs/architecture.md); the top-level map is the [README](../../README.md).

## Set up from a clean clone

- **Runtime:** Node ≥ 22 (`node --test` / `node --check` are the whole toolchain — no bundler, no linter). Deploying the backend also needs the AWS SAM CLI + AWS credentials; developing the client needs only Chrome.
- **Per-package installs are independent** — each sub-package has its own `package.json`/lockfile; there is no root `node_modules`. The root, `client/`, and `shared/` need **no** dependencies at all; only `server/` and `dev/` do.

```bash
npm test                                       # root: URL-normalizer corpus + shared drift guard (no deps)
npm --prefix client test                       # client unit + manifest/packaging guards (no deps)
npm --prefix server ci && npm --prefix server test   # handler logic, DynamoDB mocked at the SDK boundary
npm --prefix dev ci && npm --prefix dev test         # the executable-requirements suite (client UI + server)
```

`npm run test:all` (from the root) chains all four in order — that is the single command that must be green (see [Verify a change](#verify-a-change)).

> **The `.claudinite/` mount.** The Claudinite corpus is gitignored and hydrated at session start by
> `.claude/hooks/sync-claudinite.sh` (it downloads `missingbulb/Claudinite`). Never commit `.claudinite/`;
> if it's missing, the SessionStart hook (or `CLAUDINITE_REF=<ref>` to pin) repopulates it.

## Run it / see it work

- **Client, unpacked:** `chrome://extensions` → enable Developer mode → **Load unpacked** → select `client/`. A plain checkout is **dev-pointed** (the committed `client/config.mjs` `API_BASE_URL` targets the dev stack on purpose — a non-release build never talks to prod). Open the side panel from the toolbar; it fetches comments only while open, for the active tab, on commentable pages. Details + the dev/prod injection model: [`client/README.md`](../../client/README.md).
- **Server:** iterate against the **dev** stack (`tldr-app-dev`, its own DynamoDB table — a dev write can never reach prod). Deploy/seed commands and the dev-vs-prod promotion model: [`server/README.md`](../../server/README.md); the separate dev AWS account is the [dev-account runbook](../docs/dev-account-runbook.md).
- **See a *change* actually work — executable requirements.** A product requirement is stated once in [`dev/requirements/requirements.md`](../requirements/requirements.md) and proven by a case (a rendered-panel snapshot, a click-behavior test, or a pure rule). This is how a UI or server-contract change is *observed*, not just compiled. After an **intentional** panel change, regenerate the goldens: `npm --prefix dev run refresh:ui`. Method + invariants: [`dev/requirements/README.md`](../requirements/README.md) and the portable [ui-testing-guideline](../docs/ui-testing-guideline.md).

## Verify a change

- **Green means `npm run test:all` passes** — the same jobs CI runs (`server`, `client`, `requirements`, plus the root drift guard). Reading CI to gate a merge: use the PR-scoped check state, not the run-listing tools — see [`ci-cd.md`](ci-cd.md).
- **The test bar:** every requirement is backed by a proof, and the suite goes red the moment a leaf is added to `requirements.md` without a case claiming it. Match the existing kind for the change (snapshot / behavior / logic). General test discipline (see-it-fail, snapshot rules) is the corpus `writing-tests` skill; this repo's gotchas are [`testing.md`](testing.md).
- **The expected is owner-owned — never edit an expected (or weaken an assertion) to turn a red requirement green.** On a mismatch, surface *actual vs expected* and ask. This is the executable-requirements contract, not a style preference.
- **Shared code is a single source of truth.** After editing anything under `shared/`, run `npm run sync-shared` to regenerate the vendored `*.GENERATED.mjs` copies in `server/src/vendor/` and `client/vendor/`, and commit them; the root drift guard (`dev/build/tools/test/shared-drift.test.mjs`) fails on any byte divergence.

## Make & propose a change

- **Lifecycle (from the corpus, enforced by the `task-lifecycle` check):** open a GitHub issue → develop on a branch → reference the issue in commits (`Refs/Fixes/Closes #N`) → open a PR. The advanced git/GitHub procedures (commit layering, CI-trigger rules, recovering after a squash-merge) are the `git-github-advanced` skill.
- **Definition of done:** `npm run test:all` is green; any `shared/` edit is followed by `sync-shared` + committed generated copies; an intentional UI change has refreshed goldens and a matching requirement/case; a public API change follows the additive-only versioning policy ([architecture](../docs/architecture.md) §9.1); nothing owner-specific or generated-but-uncommitted is left dangling (see [Continuity](#continuity--handoff)).
- **Releasing is version-driven and mostly automatic** — the user-visible version is `client/manifest.json`'s `version`; merging a bump to `main` cuts the GitHub Release and the daily auto-release ships shipped-file changes to the Chrome Web Store. Touch this **only** when cutting/publishing a release: [`dev/build/release/releasing.md`](../build/release/releasing.md); zero-to-live is the [go-live runbook](../docs/go-live-runbook.md).

## Match the conventions

- **Native tooling only:** ES modules everywhere (`"type": "module"`), `node --test` for logic and `node --check` for the `chrome.*` glue that can't run headless. No bundler, no linter, no transpile step — a change that adds one is a departure, not an improvement.
- **Least privilege by default:** the manifest carries no `<all_urls>`/`host_permissions` (the API is reached via the server's `*` CORS); the deploy role is scoped to this stack's resources, not `AdministratorAccess`. Preserve both.
- **Before touching a subsystem, read its lesson** (routed from [`CLAUDE.md`](CLAUDE.md)): [`chrome-extension.md`](chrome-extension.md) for `client/`, [`aws-sam.md`](aws-sam.md) for `server/` + the build, [`ci-cd.md`](ci-cd.md) for `.github/workflows/`, [`testing.md`](testing.md) for any test. Notably: a boundary faked in more than one double (the client's `chrome.*` has two) must be taught in **every** double, or a missed call fails far from the change as a snapshot pixel-diff.

## Continuity / handoff

What a fresh session needs to resume — and what must and must not be committed:

- **Commit:** source, tests, requirement cases + their owner-approved goldens, and the regenerated `shared/*` → `*.GENERATED.mjs` vendored copies (they are checked in and drift-guarded, not build output).
- **Never commit:** `.claudinite/` (hydrated per session), `client/config.local.json` (owner-only), `node_modules/`, `dist/`/`.aws-sam/`/`*.zip` build output, and the `dev/requirements/shared/.artifacts/` mismatch debris (the committed goldens are the truth). The `.gitignore` already lists these.
- **Config is injected, never committed:** prod URLs, `GOOGLE_CLIENT_ID`, and the extension `key` live as GitHub repository **variables** and are injected into the zip only by the release workflow; committed source stays placeholder/dev-pointed. See [`client/README.md`](../../client/README.md).
- **Open product/config questions** the owner still owns are tracked in [architecture](../docs/architecture.md) §11.
