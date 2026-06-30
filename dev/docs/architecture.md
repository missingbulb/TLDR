# TLDR — Page Comments backend & client architecture (as built)

A Chrome extension that lets a signed-in user read and post community **tl;dr notes** ("comments")
attached to any web page, keyed by a normalized URL. This document is the **as-built** architecture:
the original Claude-generated brief, updated with every decision made during implementation. Decisions
that changed the design carry a **🔧 Decision** callout; the full list and rationale is in §12.

> This document was reviewed across six dimensions (auth/security, CDN, data, IaC/CI, client, cost),
> with the riskiest technical claims verified against authoritative AWS/Google/Chrome docs. The
> corrections that came out of that review are folded in below and summarized in §12.

---

## 1. Goals and constraints

- **Two operations only:** submit a comment, and read all comments for a page.
- **Minimal bespoke server code.** Managed services wired together; the only logic lives in one small Lambda.
- **Authenticated writes, public reads.** Writes require a verified Google identity. **Reads are public**
  (🔧 resolved — see §11/§12), which is what lets the CDN actually offload the origin.
- **Read-dominated, write-rare.** The design optimizes for cheap, cacheable reads.
- **Infrastructure-as-code from the first resource.** Nothing durable is created by hand in the console.
- **Repo layout:** a monorepo — `server/` (everything AWS), `client/` (the extension), plus a small
  `shared/` (the single-source URL normalizer) and `docs/`. See §8.

---

## 2. Component overview

```
Client (extension) ── decides WHETHER and WHAT to query (see §4)
      │  HTTPS. POST carries Authorization: Bearer <Google ID token>; GET is public (no header).
      ▼
CloudFront (CDN, separate stack) ── caches GET per normalized URL; passes POST through (see §6)
      │  cache miss / all writes
      ▼
API Gateway (HTTP API v2)
      │  JWT authorizer validates the Google ID token — on POST only
      ▼
AWS Lambda (Node.js 22, single small function)
      │  re-normalizes URL, validates body, reads claims, rate-limits the author
      ▼
Amazon DynamoDB (single table, on-demand)
```

The only component containing code is the Lambda. The extension contains client logic that materially
reduces server traffic (§4). CloudFront sits in front so most reads never reach the origin.

🔧 **Decision (auth token):** the client obtains a Google **ID token** (an RS256-signed JWT) via
`chrome.identity.launchWebAuthFlow` with `response_type=id_token` — **not** `chrome.identity.getAuthToken`,
which returns an opaque *access* token the JWT authorizer cannot validate. This requires a Google Cloud
OAuth client of type **"Web application."** (See §12-A1, `client/src/auth.mjs`, `server/README.md`.)

**Lambda-less variant (noted, not chosen):** API Gateway → DynamoDB via VTL removes the Lambda but makes
URL normalization, body validation, and the per-author rate limit awkward. The table and CDN are unchanged
if you ever switch.

---

## 3. Workflows

### 3.1 Submit a comment
1. Client `POST /comments` with `Authorization: Bearer <ID token>` and `{ "pageUrl", "body" }`. The client
   sends the URL it already normalized (§4.3); the server re-normalizes defensively.
2. The **JWT authorizer** verifies signature/issuer/audience/expiry; invalid → `401`, never reaches the function.
3. The **Lambda** reads verified claims (`sub`, `name`, `email_verified`); requires `email_verified`;
   re-normalizes `pageUrl` → `pageId`; validates `body` (non-empty, ≤ 8 KB); enforces a per-author rate
   limit; generates a ULID `commentId`; `PutItem`; returns `201` echoing the authoritative comment.
4. Writes are **not** cached, and the client optimistically renders the new comment locally so the author
   sees it immediately regardless of CDN TTL.

### 3.2 Read all comments for a page
1. The client first decides **whether to call at all** (§4.1–4.2). If so, it sends `GET /comments?pageUrl=…`
   **without** an Authorization header (reads are public, keeping the request cache-friendly).
2. **CloudFront** checks its cache for that normalized URL. **Hit** → served from the edge (no origin, no
   Lambda, no DynamoDB). **Miss** → forwarded to the origin.
3. On a miss, the Lambda re-normalizes the URL, issues one `Query` on `pageId`, and returns the comments
   ordered by `commentId` (ULIDs sort chronologically). CloudFront caches the response per TTL.

**Fit:** "all comments for a page" is a single-partition `Query`; with the CDN it is usually a single edge lookup.

---

## 4. Client-side responsibilities (these bound server cost)

Server traffic is determined more by client behavior than by anything on AWS.

### 4.1 Side-pane gating (the dominant lever)
The extension fetches **only while the side pane is open** — the panel page isn't running when closed, so a
user who browses with it closed generates **zero** reads. Pages-visited-per-day is an *upper bound*, almost
never the actual number.

### 4.2 Per-site deactivation (two layers)
- **Layer 1 (non-removable code constant):** non-http(s) schemes and the Chrome Web Store (where Chrome
  blocks injection anyway). Browser-internal pages (`chrome://`, `about:`) are non-http(s), so already excluded.
- **Layer 2 (user-editable, `chrome.storage.sync`):** seeded with `localhost`/`127.0.0.1` and the major
  **search engines** (`google.com`, `bing.com`, `duckduckgo.com`), host-suffix matched. A user can remove any.
  (🔧 owner decision: search engines are off by default — their result pages are personalized/ephemeral.)

### 4.3 URL normalization (single source of truth)
The client normalizes before calling so cache keys collide for "the same page"; the server **re-normalizes**
and never trusts the client's value (prevents poisoned cache keys). Rules: lowercase scheme+host; drop
`#fragment`; **drop only known tracking params** (`utm_*`, `fbclid`, `gclid`, …) while **keeping the rest,
sorted by key**; remove trailing slash → e.g. `https://example.com/articles/42` and
`https://www.youtube.com/watch?v=ABC`. http/https only.

🔧 **Decision (tracker-stripping, owner-chosen):** the brief's strip-the-whole-query default collapsed pages
whose identity lives in the query (all `youtube.com/watch?v=…` into one thread). v1 instead strips only the
tracker set and keeps meaningful params (sorted, so `?a=1&b=2` ≡ `?b=2&a=1`). The tracker list is `utm_*` (a
structural prefix) plus a small explicit set of non-utm trackers in `shared/normalizeUrl.mjs`.

🔧 **Decision (single source):** rather than the brief's "copied constant," the rules live once in
`shared/normalizeUrl.mjs` (WHATWG `URL`, runs in Node and the browser), vendored **byte-identically** into
`server/` and `client/` with a CI **drift guard** (`test/shared-drift.test.mjs`). Divergent copies would make
the client write under `pageId` A and a read look under `pageId` B — a silent data loss (§12-A6).

> ⚠️ **Remaining limitation:** dropping the fragment still collapses hash-routed SPAs (`example.com/#/a` vs
> `/#/b`) into one `pageId`. Acceptable for v1; revisit if a target SPA family matters.

---

## 5. DynamoDB table design

A **single table**, on-demand, one item per comment.

### 5.1 Keys
| Role | Attribute | Type | Description |
|------|-----------|------|-------------|
| Partition key | `pageId` | String | Normalized page URL. Groups all comments for one page. |
| Sort key | `commentId` | String | **ULID (canonical uppercase)** — unique and time-ordered, so a `Query` returns comments in creation order for free. |

Read page = `Query` on `pageId`. Submit = `PutItem`.

### 5.2 Non-key attributes
| Attribute | Type | Notes |
|-----------|------|-------|
| `authorSub` | String | Google `sub`. Durable author identity. Returned to clients as `authorId`. |
| `authorName` | String | Display name from the token. |
| `body` | String | Comment text, validated before write (≤ 8 KB). |
| `createdAt` | Number | Epoch ms, **derived from the same ULID** (one clock read, no drift). |
| `pageUrlRaw` | String | Original URL, for debugging. Never returned in the read projection. |
| `authorEmailHash` | String | **Salted one-way SHA-256** of the verified email. Moderation only; **never returned**. |
| `expiresAt` | Number | *(rate-limit counter items only)* epoch seconds; DynamoDB TTL auto-deletes them. |

🔧 **Decision (email → salted hash, owner-chosen):** the **raw** email is **never stored or returned** —
public, CDN-cached reads would make any returned field world-readable. A **salted one-way hash**
(`authorEmailHash`, salt = the `EmailHashSalt` server secret) is stored for moderation/abuse correlation
(equal emails hash equally) and is excluded from the **allowlist** read projection, so it can never leak
through reads.

### 5.3 Access patterns and indexes
| Pattern | Implementation |
|---------|----------------|
| All comments for a page | `Query` PK = `pageId` (paginated via opaque `nextToken`) |
| Create a comment | `PutItem` |
| Per-author rate limit | conditional `UpdateItem` on `pageId = RL#<sub>`, TTL'd counter |
| (future) All comments by a user | would need a **GSI** on `authorSub` — **not** in v1 |

No GSI in v1.

### 5.4 Capacity mode
**On-demand** — spiky, idle much of the time, zero cost when idle. Items are < 1 KB → ~1 WRU/write, a
fraction of an RRU/read (eventually consistent).

### 5.5 Data-safety policies (day one)
- `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` on the table.
- **PITR** enabled; **SSE** enabled.
- **Stack termination protection** — enabled via a one-time CLI command post-deploy (not expressible in the
  template body; see `server/README.md`).
> Always read the changeset. `Replacement: True` on the table is a **hard stop** — replacement makes a new
> empty table and data does not follow. The frozen fields are `KeySchema` + `AttributeDefinitions`.

---

## 6. CDN / caching layer (CloudFront)

Reads are cacheable because, for a given page, every viewer gets the same comment list. CloudFront fronts the
API in its **own stack** (§8) and serves most reads from the edge.

### 6.1 What it buys you
- **Origin offload:** a cache hit skips API Gateway, Lambda, and DynamoDB.
- **Latency:** served from a near edge rather than a round trip to the single Tel Aviv region.
- **Spike absorption** and a **generous perpetual free tier** (1 TB + 10 M requests/month, always free).

### 6.2 Freshness — short TTL, NOT per-write invalidation
Per-write invalidation is a cost trap ($0.005/path beyond 1,000/month free — e.g. 100k invalidations ≈ $500).
Instead: a **short TTL** (`MinTTL=0, DefaultTTL=30, MaxTTL=60`). The **author** sees their own comment
instantly via optimistic render; the TTL delay only affects *other* people seeing *new* comments.

### 6.3 The cache-key / auth mechanism (🔧 corrected from the brief)
The brief's mechanism ("include Authorization in a custom OriginRequestPolicy") is **invalid** — CloudFront
rejects a *custom* origin request policy that names `Authorization`. As built (§12-A2):
- **Custom CachePolicy** keys on the `pageUrl`/`nextToken` querystring **+ the `Origin` header**, and
  **excludes `Authorization`** → every viewer shares one cached read per page; per-origin CORS isn't cross-served.
  Note the API-level CORS `AllowOrigins` is **`*`**, not the extension origin: API Gateway HTTP API (v2) rejects
  the `chrome-extension://` scheme outright (deploy fails with `BadRequestException: Invalid format for origin …`),
  accepting only `http(s)://…` or `*`. This is safe — the JWT authorizer gates writes (POST only), reads are
  public by design, and the extension reaches the API via its manifest `host_permissions`, so browser CORS was
  never the extension's security boundary (🔧 §12-A9).
- **Managed `AllViewerExceptHostHeader`** origin-request policy forwards `Authorization` + querystrings to the
  origin but **strips Host** (forwarding Host to an API Gateway origin returns 403).
- One distribution, one (default) behavior: CloudFront caches GET/HEAD and always passes POST through.

### 6.4 Auth interaction → **public reads**
A cache **hit** is served **before** the request reaches API Gateway, so it bypasses the authorizer. Therefore
authenticated reads would be enforced only on misses (security theater) unless verified at the edge with
Lambda@Edge (RS256 can't be done in a lightweight CloudFront Function) *and* keyed per-token (which destroys
the hit rate). 🔧 **Decision:** **reads are public** — `GET /comments` has **no** authorizer; the JWT
authorizer is on `POST` only. This fits a community-notes product and is the only config where the CDN
meaningfully offloads the origin.

---

## 7. Cost model (rough, sample-number based)

Unchanged from the brief's estimates (verified roughly correct as of 2026; confirm exact rates at build time).
Rates: API Gateway HTTP API ~$1.00/M req; Lambda $0.20/M + ~GB-s; DynamoDB on-demand ~$1.25/M writes,
~$0.25/M strong reads (eventual ≈ half); CloudFront ~$1/M req with 10 M/month always free.

- **Anchor:** avg user ≈ 130 pages/day ≈ 4,000/month — the *ceiling* of reads/user, reached only if the pane
  were open on every page with nothing deactivated. With §4 gating, realistic reads are ~5–10% (~200–400/user/mo);
  writes ~5/user/mo.
- **DynamoDB** is effectively free at this workload (≤ ~$5/mo at 100k MAU); storage stays in the 25 GB free tier for a long time.
- **Full stack, no CDN, steady state:** ~$0.4 (1k MAU) · ~$4 (10k) · ~$39 (100k). First-12-months free tiers make
  the 1k–10k tiers ≈ $0.
- **With CDN:** ≤10 M reads/mo → CloudFront requests free and most reads skip the origin → ~$0–1/mo at 1k–10k;
  ~$20–24 at 100k (~cost-neutral vs no-CDN) with much better latency. **Avoid per-write invalidation** or the bill inverts.
- **§4 gating is ~15× cheaper** than fetch-on-every-page (the entire value of the client rules).

**Bottom line:** a few dollars a month or less for a long time, and $0 within the first-year free tiers. The
CDN is justified by latency and offload more than dollars at small scale.

Cost watch-items: a GSI (multiplies writes), verbose CloudWatch logging, CloudFront invalidations, large bodies.

---

## 8. Repository structure, IaC, and deployment

### 8.1 Structure (as built)
```
repo-root/
├── shared/                          # 🔧 single source of truth for normalization (vendored into both)
│   ├── normalizeUrl.mjs
│   └── test/normalizeUrl.test.mjs   # the normalizer corpus test, next to what it tests
├── server/                          # everything AWS
│   ├── template.yaml                # SAM: HTTP API + JWT authorizer + Lambda + DynamoDB
│   ├── cdn-template.yaml            # plain CFN: CloudFront (separate stack)
│   ├── samconfig.toml
│   ├── src/handler.mjs              # the only logic; + src/vendor/normalizeUrl.GENERATED.mjs
│   └── test/handler.test.mjs
├── client/                          # the MV3 Chrome extension (no bundler)
│   ├── manifest.json, config.mjs
│   ├── src/… (service worker, side panel, options, auth, api, denylist, optimistic)
│   ├── vendor/normalizeUrl.GENERATED.mjs
│   ├── icons/  scripts/  test/
├── dev/                             # repo dev tooling (not shipped)
│   ├── requirements/                # the executable-requirements suite (client UI + server)
│   ├── docs/                        # architecture.md (this file) + ui-testing-guideline.md
│   └── build/tools/                 # sync-shared.mjs + test/shared-drift.test.mjs (the drift guard)
└── .github/workflows/               # server.yml, client.yml, requirements.yml, deploy.yml, release.yml, publish-chrome-store.yml
```

### 8.2 Build artifacts and checks from one repo (CI)
🔧 Path-filtered **`server.yml`** and **`client.yml`** run build+test independently (each also runs the
repo-level normalizer corpus + drift guard, since both depend on `shared/`); **`requirements.yml`** runs the
cross-tier executable-requirements suite. A pure change to one folder does not run the others. (This replaces
a single combined pipeline; deploy/release are separate, below.)

### 8.3 Who applies the changes (no local execution)
A push/merge to `server/**` on `main` triggers **`deploy.yml`** on an ephemeral GitHub runner, which runs
`sam build && sam deploy`. SAM hands the template to **CloudFormation**, which actually creates/updates the
resources. The runner is just the executor.

### 8.4 How the runner authenticates to AWS — **GitHub OIDC**
An IAM role trusts GitHub's OIDC provider, scoped via the trust policy to `repo:missingbulb/tldr:ref:refs/heads/main`
with `aud = sts.amazonaws.com`. The runner assumes it for short-lived creds — **no long-lived AWS keys anywhere.**
🔧 The deploy job is **gated on the repository variable `AWS_DEPLOY_ROLE_ARN`** (a *variable*, not a secret, so a
job-level `if:` can skip cleanly → the run is *gray/skipped*, never red, until configured). Least-privilege, never root.

### 8.5 Deploy discipline
- **Review every changeset** (`confirm_changeset` for manual deploys). `Replacement: True` on the table is a hard stop.
- **Two stacks split by change-frequency** (🔧 §12-B7): the high-churn app stack (API/Lambda/DynamoDB) deploys
  fast and often; the low-churn CDN stack (CloudFront, ~15–20 min/deploy) is separate and deployed rarely, taking
  the app's API endpoint as a parameter. The table (the one stateful resource) stays in the app stack, guarded by
  Retain + PITR + termination protection.
- **Greenfield IaC:** no "import existing console resources" step.
- **Dev / sandbox environment** (🔧 owner decision, #27): an `Environment` SAM parameter (`dev`|`prod`,
  default `prod`) suffixes non-prod resource names, so a dev deploy (`tldr-app-dev`) gets a physically
  distinct table (`tldr-comments-dev`) in the **same account** — dev testing can't read or write prod
  data. prod keeps the exact legacy names (a rename would replace the live table). No dev CDN (the dev
  client hits `ApiUrl` directly); the dev client build is `npm run build:dev`. Seed/teardown:
  `server/scripts/seed-dev.mjs` / `sam delete --stack-name tldr-app-dev`.
- **Promotion model** (🔧 owner decision, #27): a push to `main` with server changes **auto-deploys
  dev** (the always-current sandbox); **prod is never automatic** — it's a deliberate manual promotion
  (`workflow_dispatch`, `environment: prod`) run once a change is verified in dev. Both run from
  `refs/heads/main`, so the OIDC trust policy stays scoped as-is (no broadening). This decouples *code
  merged to main* from *prod live*, which matters because the table is the one stateful resource.

See `server/README.md` for the exact one-time setup (Google OAuth client, OIDC role + trust policy, deploy
commands, termination protection).

---

## 9. API contract (summary for the client)

| Method | Path | Auth | Request | Cached? | Success |
|--------|------|------|---------|---------|---------|
| `POST` | `/comments` | Bearer ID token | `{ "pageUrl", "body" }` | No | `201` + `{ "comment": { commentId, body, authorName, authorId, createdAt } }` |
| `GET` | `/comments` | **public** | query `pageUrl` (+ optional `nextToken`) | Yes (TTL 30–60s) | `200` + `{ "comments": [ { commentId, body, authorName, authorId, createdAt } ], "nextToken"? }` |

Errors: `400` invalid body / missing or non-http(s) `pageUrl`; `401` missing/invalid token; `403` unverified
email; `413` body too large; `429` per-author rate limit; `404` unknown route; `500` unexpected.

---

## 10. Out of scope for v1 (deliberate)

- Editing/deleting comments (delete would check `authorSub` against caller `sub` — `authorId` is already returned to enable it).
- "My comments across all pages" (would add a GSI on `authorSub`).
- **Spam/abuse — partially addressed.** v1 ships a **per-author rate limit** (TTL'd DynamoDB counter), a **body
  cap**, and a **verified-email requirement**. Edge throttling (API Gateway stage `RouteSettings`) and reserved
  concurrency are deferred — reserved concurrency can fail a new account's deploy when its concurrency limit is low,
  and HTTP API stage throttling is awkward via SAM's high-level resource. Add once account limits are known.
- Multi-region writes (single region; CloudFront already gives read-edge reach).
- Replies/threading, voting, rich text.
- Full end-to-end browser tests of the extension glue (the pure logic is unit-tested; the `chrome.*` glue is `node --check`'d).

---

## 11. Resolved decisions + the questions that still need the owner

The brief's "assumptions to confirm" are **resolved** below; only the genuinely owner-dependent items remain open.

| # | Topic | v1 decision (implemented) — ✅ = owner-confirmed |
|---|-------|---------------------------|
| 11.1 | Read auth | ✅ **Public reads**, authenticated writes (§6.4). |
| 11.2 | URL → pageId | ✅ **Strip only tracking params**, keep the rest sorted (§4.3). |
| 11.3 | Cache TTL | **30–60 s**, no per-write invalidation (§6.2). |
| 11.4 | Search engines | ✅ **Off by default** (`google.com`/`bing.com`/`duckduckgo.com` seeded in the denylist, §4.2). |
| 11.5 | Email | ✅ **Salted one-way hash** stored for moderation; raw email never stored/returned (§5.2). |
| — | Region | **`il-central-1`** (Tel Aviv), default `*.cloudfront.net` domain (no us-east-1 ACM needed). |
| — | CORS `AllowedExtensionOrigin` | **`*`** — API Gateway v2 rejects the `chrome-extension://` scheme; not a security regression (JWT gates writes, reads public, extension uses `host_permissions`) (§6.3/§12-A9). |
| — | Runtime / SDK | **`nodejs22.x`**, AWS SDK **bundled** (§12-A4/A5). |

### Still open — needs the owner (cannot be safely defaulted)
1. **Google OAuth "Web application" client** — the owner must create it and provide the **client id** (= JWT
   authorizer audience = `client/config.mjs` `GOOGLE_CLIENT_ID`).
2. **Extension id / signing `key`** — fixes the `chromiumapp.org` redirect URI (it does **not** lock the CORS
   origin: `AllowedExtensionOrigin` is `*` because API Gateway v2 rejects the `chrome-extension://` scheme —
   §6.3/§12-A9). Confirm the production id (or approve a fixed manifest `key`); a dev id too if dev/prod differ.
3. **AWS account id + GitHub repo/branch** for the OIDC trust policy `sub`. (Assumed `missingbulb/tldr` + `main`.)
4. **`EmailHashSalt`** — set a long random server secret (`server/README.md`); without it the email hash is unsalted.
5. **Throttle numbers** — the per-author rate (default 10/min) and any future edge throttle depend on the
   expected user base / cost ceiling.

---

## 12. Decisions & deviations from the brief (with rationale)

Corrections that changed the build (verified against authoritative docs during the review):

- **A1 — Auth token (BLOCKER).** `getAuthToken` returns an opaque access token the JWT authorizer rejects. Use
  `launchWebAuthFlow` + `response_type=id_token` and a Google **Web-application** OAuth client; verify the `nonce`.
- **A2 — CloudFront Authorization forwarding (BLOCKER).** A custom origin-request policy naming `Authorization`
  is rejected at deploy. Use a custom CachePolicy (excludes Authorization, keys on pageUrl + Origin) + the managed
  `AllViewerExceptHostHeader` policy (forwards Authorization, strips Host).
- **A3 — `authorEmail` PII leak (BLOCKER).** Public reads make any returned field world-readable; the **raw**
  email is never stored or returned, and reads use an allowlist projection. (Owner decision: keep a *salted
  one-way hash* for moderation — see §5.2/§11.5 — still never returned.)
- **A4 — Runtime.** `nodejs18.x`/`nodejs20.x` are EOL/EOL-soon in 2026; pin `nodejs22.x`.
- **A5 — SDK bundling.** The managed runtime doesn't ship `@aws-sdk/lib-dynamodb` and its SDK minor drifts; bundle it.
- **A6 — Shared normalizer.** A real single source + byte-equality drift guard, not a copied constant.
- **A7 — Abuse cap.** Pull a per-author rate limit (and body cap, verified-email) into v1 (§10).
- **A8 — OIDC gating.** Lock the trust policy to exact `aud`+`sub`; gate the deploy on a repo *variable* so it
  skips gray, not red.
- **A9 — CORS origin can't be locked to the extension (deploy-time correction, June 2026).** The doc assumed CORS
  `AllowOrigins` would be the `chrome-extension://<EXTENSION_ID>` origin; a real AWS deploy proved this impossible —
  API Gateway HTTP API (v2) rejects the `chrome-extension://` scheme (`BadRequestException: Invalid format for
  origin …`), accepting only `http(s)://…` or `*`. So `AllowedExtensionOrigin` **must be `*`**. Not a security
  regression: the JWT authorizer gates writes (POST only), reads are public by design, and the extension reaches
  the API via its manifest `host_permissions` — browser CORS was never the extension's security boundary.

Choices made and noted (not detrimental):
- **Two stacks** (app + CDN) split at the change-frequency line, over a single stack with an `EnableCdn` toggle —
  removes the 15-20 min CloudFront propagation from app iteration and the toggle footgun.
- **No bundler for the client** — Chrome loads ES modules directly; the normalizer is vendored + drift-guarded.
- **CI split into `server.yml`/`client.yml` + separate `deploy.yml`/`release.yml`/`publish-chrome-store.yml`**,
  each CI job also running the cross-cutting tests because `shared/` is a real cross-folder dependency.
- **Placeholder icons** generated by a built-in PNG encoder — replace before a store submission.
