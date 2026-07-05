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

### 4.4 Per-page response cache (no refetch on tab return)
The side panel keeps an in-memory `pageId → comments` cache for the panel's lifetime (≈ until the window's
panel is closed). **A plain tab switch back to an already-fetched page renders from this cache with no network
call;** the panel only fetches on initial load and on a *real* navigation/reload of the active tab
(`onUpdated` URL-change or `status: 'complete'`, and SPA `onHistoryStateUpdated`). So tab 1 → tab 2 → tab 1
costs one fetch, not two. Bounded at `MAX_CACHE_PAGES` (oldest-evicted) so a long session can't grow it
unbounded. Worked example: `client/src/sidepanel.mjs` (`bucketFor`/`syncView`, the `useCache` flag on `refresh`).

🔧 **Decision (owner-chosen — cache until close, don't revalidate):** the primary use case is **not** a live
thread — comments arrive sparsely and far apart — so the value of showing freshly-fetched comments every time
a tab regains focus is near zero, while the cost (a round-trip, a re-render, a brief loading flash) is paid on
every switch. We therefore cache-until-closed rather than stale-while-revalidate or a TTL: a tab switch trusts
the cache outright, and only an explicit reload/navigation refetches. This layers under the §4.1 side-pane
gate and the §6 CDN: even a cache miss is usually a cheap edge hit, and now repeat views skip the network
entirely. (The per-page bucket also scopes optimistic local comments per page, so a pending post on one tab
can't leak onto another tab's view.)

### 4.5 Redirect provenance — the cleaner-URL offer (issue #58)

§4.3's normalization can't fix **redirect aliasing**: notes are keyed by the tab's *final* URL, so a clean
shareable address that redirects to a messier same-site one (a locale path, session/variant params outside
the tracker set) fragments its visitors across page ids while the thread's natural shared key is the
**pre-redirect** URL. The service worker records each tab's arrival (`webNavigation.onBeforeNavigate`/
`onCommitted`, top frame only — a permission the manifest already held, so no new install warning) into
`chrome.storage.session` — it survives SW recycles, dies with the browser session, and is dropped when the
tab closes; `client_redirect` commits chain multi-hop journeys back to the URL the user actually opened.
When the landing page shows **no notes** and the arrival qualifies, the panel offers the pre-redirect page's
notes; accepting switches the panel to that page id end to end (reads *and* writes), consolidating the
thread under the shareable address — the same key the §9.4 link-hover preview looks up. The model is the
pure `client/src/redirect-provenance.mjs`; the UI contract is requirements §12.

🔧 **Decision (owner-chosen — same-site + cleaner only):** the offer fires only when the redirect source is
same-site (host-suffix relation) **and** strictly cleaner (its normalized URL is shorter — the redirect
*added* path/params) **and** a different page id. Cross-site hops (t.co/bit.ly shorteners) never prompt —
low noise first; widen later if real aliases are missed.

🔧 **Decision (owner-chosen — accept = full switch):** accepting doesn't just peek at the cleaner page's
notes; the composer and votes post there too. A read-only peek would keep fragmenting new notes across
redirect targets, defeating the consolidation the offer exists for.

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
| `category` | String | The comment's category id (issue #25), one of the shared allowlist (`shared/categories.mjs`). Returned; **read-time default `chitchat`** for legacy rows written before categories existed. |
| `createdAt` | Number | Epoch ms, **derived from the same ULID** (one clock read, no drift). |
| `pageUrlRaw` | String | Original URL, for debugging. Never returned in the read projection. |
| `authorEmailHash` | String | **Salted one-way SHA-256** of the verified email. Moderation only; **never returned**. |
| `voteCount` | Number | Endorsements on the comment, maintained atomically with each vote item (§9.2). Written as `0` at creation (not left absent) so a never-voted comment is still indexed by `CategoryRankIndex` below; returned, defaults to 0 for legacy rows written before this. |
| `voterSub` | String | *(vote items only)* the voter's Google `sub`. Bookkeeping; **never returned** (a voter's identity stays private). |
| `expiresAt` | Number | *(rate-limit counter items only)* epoch seconds; DynamoDB TTL auto-deletes them. |
| `categoryPageId` | String | *(comment items only)* `"<pageId>#<category>"` — the `CategoryRankIndex` GSI's partition key (issue #26). Internal; **never returned** (outside the allowlist projection). |

🔧 **Decision (email → salted hash, owner-chosen):** the **raw** email is **never stored or returned** —
public, CDN-cached reads would make any returned field world-readable. A **salted one-way hash**
(`authorEmailHash`, salt = the `EmailHashSalt` server secret) is stored for moderation/abuse correlation
(equal emails hash equally) and is excluded from the **allowlist** read projection, so it can never leak
through reads.

### 5.3 Access patterns and indexes
| Pattern | Implementation |
|---------|----------------|
| All comments for a page | `Query` PK = `pageId`, SK `< VOTE#` (excludes vote items) — paginated via opaque `nextToken` |
| Create a comment | `PutItem` |
| Cast / toggle a vote | `TransactWriteItems`: vote item (`SK = VOTE#<commentId>#<voterSub>`) + `voteCount` ±1 (§9.2) |
| Per-author rate limit | conditional `UpdateItem` on `pageId = RL#<sub>`, TTL'd counter |
| The leading comment for a page + category (§9.2, issue #26) | `Query` the `CategoryRankIndex` **GSI** — PK `categoryPageId`, SK `voteCount`, `ScanIndexForward: false, Limit: 1` |
| (future) All comments by a user | would need a **GSI** on `authorSub` — **not** in v1 |

**`CategoryRankIndex` (issue #26, the link-hover preview's "leading comment" lookup):** PK
`categoryPageId` (`"<pageId>#<category>"`, written only on comment items), SK `voteCount`. **Sparse by
construction** — vote items and rate-limit counters never carry `categoryPageId`, so they never appear
in it, with no extra filtering needed. Adding a GSI is an **additive** `UpdateTable` — it does not touch
the base table's `pageId`/`commentId` key schema (still frozen, §5.1) and does not replace the table.
Ties at the top `voteCount` break arbitrarily (DynamoDB's own tie order, not a documented contract) —
accepted for a "leading comment" preview.

🔧 **Known limitation (no backfill):** a GSI only indexes items that already carry its key attributes at
write time. A comment posted **before** this GSI shipped has no `categoryPageId` and is invisible to the
ranking query until it's rewritten — there is no backfill migration, consistent with this table's
existing no-migration, default-at-read-time treatment of `category` itself (§5.2).

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
  public by design, and the `*` is also what lets the extension reach the API under standard CORS (so it needs
  no `host_permissions`); browser CORS was never the extension's security boundary (🔧 §12-A9/§12-A10).
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
- **Dev / sandbox environment** (🔧 owner decision, #27): the environment is derived from the **stack
  name**, not an external parameter. The canonical `tldr-app` stack is prod and its table is **pinned in
  source** to `tldr-comments` (renaming would replace the live table) — prod takes no environment input,
  so nothing at deploy time can repoint it. Any other stack name (`tldr-app-dev`, or an ad-hoc
  `tldr-app-<x>`) is non-prod and gets a stack-scoped table (`<stack>-comments`, e.g.
  `tldr-app-dev-comments`) in the **same account**, so dev testing can't read or write prod data. No dev
  CDN (the dev client hits `ApiUrl` directly); the dev client build is `npm run build:dev`.
  Seed/teardown: `server/scripts/seed-dev.mjs` / `sam delete --config-env dev`.
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
| `POST` | `/comments` | Bearer ID token | `{ "pageUrl", "body", "category"? }` | No | `201` + `{ "comment": { commentId, body, authorName, authorId, createdAt, voteCount, category } }` |
| `GET` | `/comments` | **public** | query `pageUrl` (+ optional `nextToken`) | Yes (TTL 30–60s) | `200` + `{ "comments": [ { commentId, body, authorName, authorId, createdAt, voteCount, category } ], "nextToken"? }` |
| `POST` | `/comments/{commentId}/vote` | Bearer ID token | `{ "pageUrl" }` | No | `200` + `{ "ok": true }` (idempotent cast) |
| `DELETE` | `/comments/{commentId}/vote` | Bearer ID token | `{ "pageUrl" }` | No | `200` + `{ "ok": true }` (idempotent toggle-off) |
| `GET` | `/comments/top` | **public** | query `pageUrl` (+ optional `category`) | Yes (TTL 30–60s) | `200` + `{ "comment": { commentId, body, authorName, authorId, createdAt, voteCount, category } \| null }` |

Errors: `400` invalid body / missing or non-http(s) `pageUrl` / unknown `category`; `401` missing/invalid token; `403` unverified
email; `413` body too large; `429` per-author rate limit; `404` unknown route / vote on a missing comment;
`500` unexpected. `GET /comments/top` returns `200` with `comment: null` (never `404`) when the page +
category has no comments yet — an absent leader is an expected empty state, not an error (§9.4).

### 9.2 Upvoting (issue #22)

A signed-in user casts **one vote per comment**, toggleable off — the substrate for later ranking (#25).
It stays within every deliberate constraint (no GSI, frozen key schema, public CDN-cached reads):

- **In-partition vote items.** A vote is its own item in the comment's page partition, sort key
  `VOTE#<commentId>#<voterSub>`. The `VOTE#` prefix sorts strictly **above** every comment sort key (a
  canonical ULID always starts with a digit `0`–`7`, and `'V' > '7'`), so the read `Query` bounds the
  sort key `< VOTE#` to return only comments — votes never surface in the list. No GSI, no key-schema
  change.
- **Atomic count.** The comment carries a `voteCount` attribute, kept exactly equal to its number of
  vote items via one `TransactWriteItems`: cast = `Put` the vote (only if absent) `+ ADD voteCount 1`;
  toggle = `Delete` the vote (only if present) `+ ADD voteCount -1`. A duplicate cast / a missing-vote
  toggle both cancel the transaction and are treated as **idempotent success**; a vote on a missing
  comment is `404` (the count `Update` is guarded by `attribute_exists`, so no body-less stub is
  conjured).
- **Attributed writes.** Both routes opt into the same Google JWT authorizer as `POST /comments` — a
  vote carries the voter's identity — and re-normalize `pageUrl` server-side. The runtime role gains
  `dynamodb:DeleteItem` (a transaction is authorized by its underlying per-item actions).
- **`voteCount` on the public read; own-vote on the client (🔧 owner decision, issue #22).** The count
  is added to the allowlist projection and so rides the shared, CDN-cached read — **stale up to the
  ~60s TTL and identical for every viewer**, an accepted trade-off that preserves the cache design. The
  viewer's **own** vote (`youVoted`) **can't** ride that read (the cache key excludes `Authorization`),
  so the client shows it optimistically and persists the own-vote set in `chrome.storage.local`
  (`myVotes`), overlaying it on each read and preserving it across a refresh (`mergeComments`). The
  projection never returns any per-voter identity.
- **Additive under §9.1.** New routes + a new projection field only; no existing field is reshaped, so
  an older client keeps working. `voteCount` is the first field added under the additive-only policy.

Every request also carries **`X-Client-Version`** — the extension's manifest `version` — as a request header
(see §9.1). It's telemetry only; it never changes a response, the cache key, or the body.

### 9.3 Categories (issue #25)

A comment's **category** is a **top-level MODE**, not a per-note tag in the UI (🔧 owner decision). The
reader picks the **current category** from the **toolbar icon**, and the panel shows **only that
category's notes**, wearing that category's look & feel and composer copy — no badge, no filter bar. The
seed set is a **growable curated list** — **TLDR · Spoiler · Chitchat**. It stays within every
deliberate constraint (no GSI, frozen key schema, one CDN-cached read per page):

- **Single source of truth (taxonomy) + per-category design (presentation).** The *taxonomy* lives once
  in `shared/categories.mjs` (the ordered ids + the read-time default + validation/label helpers),
  vendored byte-identically into `server/` and `client/` with the same drift guard as the URL normalizer
  (`test/shared-drift.test.mjs`); the server validates against it and the client's menu/view read it.
  Each category's *design* is a self-contained folder `client/src/categories/<id>/`: a **scoped
  stylesheet** (`<id>.css`, its colour tokens under `body[data-category="<id>"]`, so it bites only when
  active and a restyle can't touch another) + a **copy descriptor** (`design.mjs` — the "Post tl;dr"
  label, the placeholder). Strictly presentation — no behavior; the panel drives every category
  identically.
- **Growable curated allowlist, not a frozen enum (🔧 owner decision).** Users pick from the known list;
  they can't invent categories. Validation is allowlist membership (`isValidCategory`), so the set grows
  by **appending one entry** to the shared constant (+ a re-sync, + a matching design folder) — no schema
  change. An unknown category on write is a client bug → `400`.
- **Additive, backward-compatible field.** `category` is an **optional** request field with a
  **server-side default** (§9.1): an older client that omits it keeps working. It's stored as a plain
  item attribute and added to the allowlist projection as `category: item.category ?? DEFAULT_CATEGORY`
  — so the read is safe over **pre-existing rows** (defaulted to `chitchat` at read time) with **zero
  migration/backfill**. It's the **second** field added under the additive-only policy (after
  `voteCount`). A note is posted under the **current** category; the default view (before one is chosen)
  equals `DEFAULT_CATEGORY` (`chitchat`), so untagged/legacy notes stay visible by default.
- **The current-category view is client-side — the cache is untouched.** The whole page (≤50 notes)
  already arrives in one public, CDN-cached `Query`; `render()` shows only the current category's notes,
  and switching category (a `chrome.storage.local` write the panel watches) **re-renders without a
  refetch** — a `?category=` server param never multiplies the cache key.
- **Toolbar-icon toggle (🔧 owner behaviour).** Pane closed → the icon opens a category **menu** popup
  (`src/category-menu.html`) that sets the current category and opens the pane; pane open → the icon
  **closes** the pane. MV3 has no is-open/close API and a popup suppresses `onClicked`, so the service
  worker tracks pane-open via a Port the panel opens and **swaps the action popup** (menu when closed /
  cleared when open, closing via a Port message). Opening the pane from the popup needs
  `sidePanel.open()` (Chrome **116+**, so `minimum_chrome_version` is bumped 114 → 116). Best-effort and
  window-agnostic (the common case is one window); the pane↔SW handshake is chrome glue covered by the
  real-browser e2e (§8.1 / §10).
- **Ranking (the top note per category) is built as `GET /comments/top` (issue #26)**, layered on the
  upvoting substrate (§9.2) via the `CategoryRankIndex` GSI (§5.3) — see §9.4.

### 9.4 Link-hover preview (issue #26)

Hovering an **http(s) link** while browsing shows a small popup with the **leading (top-voted) comment**
for that link's URL, in the reader's **current category** — without opening the panel.

- **Server: a dedicated ranking endpoint, not a client-side scan.** `GET /comments/top` queries the
  `CategoryRankIndex` GSI (§5.3) directly, so the answer is correct regardless of how many comments a
  page has — unlike the side panel's own read (§4.4, §9), which only ever sees the first `nextToken`
  page. Same public/CDN-cached shape as `GET /comments` (§9); `category` joins `pageUrl`/`nextToken` in
  the CDN cache-key whitelist (§6.3).
- **Content script, not the panel — the one feature reaching beyond the extension's own pages.**
  `client/src/link-hover.mjs` runs on an arbitrary third-party page, registered **dynamically**
  (`chrome.scripting.registerContentScripts`) rather than declared in the manifest, so it only exists
  after the reader opts in.
- **🔧 Optional permission, opt-in via toggle (owner decision — supersedes #30's "zero host access" only
  for this one feature).** The manifest requests `optional_host_permissions` (`http://*/*`,
  `https://*/*`) — never a static `host_permissions`/`content_scripts` entry — plus the silent
  `scripting` permission. Both carry **no install-time warning**. An options-page toggle
  (`chrome.permissions.request()`, which must run inside the click handler — Chrome refuses it from a
  background message) is the **only** place host access is ever requested; unchecking it revokes the
  permission and unregisters the script, so the extension's default footprint stays exactly what #30
  established. `hover-registration.mjs` self-heals the enabled-flag/granted-permission pair on every
  service-worker start (e.g. a permission revoked via `chrome://extensions` directly).
- **Same gates as the side panel, reused not reimplemented.** A hovered link is a lookup candidate only
  if `evaluatePage` (§4.2 — http(s)-only, the synced per-site denylist) says so for the link's *target*
  URL; the category used is read fresh from `chrome.storage.local` at hover time (no page reload needed
  after a toolbar-menu category switch). No comment in the category ⇒ **show nothing** (🔧 owner-chosen
  empty state — a purely passive, read-only affordance).
- **The fetch runs in the service worker, never the content script.** A content script sits in an
  arbitrary, CSP-unpredictable page origin; `link-hover.mjs` messages the SW
  (`chrome.runtime.sendMessage`) to do the actual `GET /comments/top` call, the same extension context
  (and same `*` CORS, §6.3/§12-A10) the side panel's own reads already use.

### 9.1 Versioning & backward-compatibility policy (issue #29)

The extension updates on the Chrome Web Store's schedule, not ours, and the server deploys independently —
so an old client can call a newer server for a long time. The standing policy keeps that safe **without**
a version in the URL.

**Additive-only contract evolution (the standing rule — owner-ratified, issue #29).** Evolve the wire
contract by *adding*, never by *reshaping*:
- A new request parameter is **always optional, with a server-side default**. An existing parameter is
  **never** made newly-required for an existing endpoint. (The handler already ignores unknown body fields
  and defaults missing ones, so a newer client's extra field never breaks an older server, and vice-versa.)
- A field in the public read projection (`toPublicComment`) is **never removed or renamed — only added**.
  Pinned by the exact key-set assertion in `server/test/handler.test.mjs` (a removed/renamed field fails it).
- **Reserve a path version (`/v2`) for a genuinely breaking change only** — one additive-only can't express —
  and escalate to it *only on future friction*. There is **no `/v1` prefix today** (it would rewrite the
  routes, the client paths, and reset the CloudFront cache key for no present gain).

**Client version signaling (`X-Client-Version`).** The side panel reads `chrome.runtime.getManifest().version`
once and attaches it to every API request (`client/src/api.mjs`); the server logs it per request
(`server/src/handler.mjs`). It rides in a **request header** on purpose:
- **Cache-neutral.** The CloudFront cache policy keys on `pageUrl` + `Origin` and **excludes headers**
  (§6.3), so the version never fragments the public-read cache.
- **CORS cost (the one non-obvious coupling).** A custom header makes even the public GET a *non-simple*
  request, so the browser preflights it — API Gateway's `CorsConfiguration.AllowHeaders` **must** list
  `x-client-version` (`server/template.yaml`), or reads/posts break in a real browser (but never in a unit
  test). Guarded by `server/test/template.test.mjs`.
- **Telemetry coverage.** The server logs the version (or `null` for a pre-versioning client) on every
  request. POST always reaches the origin, so write telemetry is complete; GET is CloudFront-cached, so read
  telemetry lands only on cache *misses* — enough to answer "is any old client still calling?".

**Deprecation / sunset.** Don't retire an old behavior until the version telemetry shows ~zero calls from the
old cohort for a sustained window. The exact threshold/window is **deferred** until we have a first real
evolution and a baseline in the logs.

**Drift / sequencing.** The first actual request/response changes (issues #22, #25) must be authored *under*
this policy — additive, or an explicit `/v2` if they truly break. The version header ships *before* them so
the logs carry a version baseline.

---

## 10. Out of scope for v1 (deliberate)

- Editing/deleting comments (delete would check `authorSub` against caller `sub` — `authorId` is already returned to enable it).
- "My comments across all pages" (would add a GSI on `authorSub`).
- **Spam/abuse — partially addressed.** v1 ships a **per-author rate limit** (TTL'd DynamoDB counter), a **body
  cap**, and a **verified-email requirement**. Edge throttling (API Gateway stage `RouteSettings`) and reserved
  concurrency are deferred — reserved concurrency can fail a new account's deploy when its concurrency limit is low,
  and HTTP API stage throttling is awkward via SAM's high-level resource. Add once account limits are known.
- Multi-region writes (single region; CloudFront already gives read-edge reach).
- Replies/threading and rich text. (**Upvoting shipped** — issue #22, §9.2; **categories shipped** — issue #25, §9.3.)
- **Per-category ranking** (the top note per category by upvotes; the leading note the hover preview #26 surfaces) — a follow-up on the upvoting + categories substrate, deliberately deferred (§9.3).
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
| 11.6 | API versioning | ✅ **Additive-only** evolution; client sends `X-Client-Version`, server logs it; reserve `/v2` for a real break only — no `/v1` now (§9.1). |
| — | Region | **`il-central-1`** (Tel Aviv), default `*.cloudfront.net` domain (no us-east-1 ACM needed). |
| — | CORS `AllowedExtensionOrigin` | **`*`** — API Gateway v2 rejects the `chrome-extension://` scheme; not a security regression (JWT gates writes, reads public; the `*` lets the extension reach the API under standard CORS, so **no** `host_permissions`) (§6.3/§12-A9/§12-A10). |
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
  regression: the JWT authorizer gates writes (POST only), reads are public by design, and the `*` is what lets
  the extension reach the API under standard CORS (so it needs no `host_permissions`) — browser CORS was never
  the extension's security boundary.
- **A10 — `host_permissions` dropped (permission-reduction, issue #30).** The extension declared
  `host_permissions: <api-origin>/*` only to *reach* the API. But API Gateway already returns
  `Access-Control-Allow-Origin: *` for every route (A9), which permits the `chrome-extension://` origin under
  standard CORS — the public GET (no header) and the Bearer POST (no cookies, so not "credentialed") both satisfy
  `*`, preflight included. So the host permission was **redundant** and is removed, dropping the "read & change
  your data on `<host>`" install warning at no functional cost. (Earlier A9 wording called `host_permissions` the
  reach mechanism — it never was once CORS is `*`.) Pre-release gate: confirm a real-browser read + post, since
  full end-to-end browser testing is a tracked v1 follow-up (§10).
- **A11 — Link-hover preview's host access is OPTIONAL, not A10's zero (issue #26).** Passive
  hover-detection on arbitrary pages needs SOME host access — there's no permission that means "hover
  any link, anywhere, and a popup just appears" with zero grant. Rather than reopen A10 for every user,
  the manifest requests it only as `optional_host_permissions` (§9.4) — no install-time warning, and the
  ONLY prompt a user ever sees is the one they trigger themselves via the options-page toggle. A10's
  actual point (no *default*, no-action-required host access) stays intact; this adds an explicit,
  reversible opt-in for one feature, not a blanket reversal.

Choices made and noted (not detrimental):
- **Two stacks** (app + CDN) split at the change-frequency line, over a single stack with an `EnableCdn` toggle —
  removes the 15-20 min CloudFront propagation from app iteration and the toggle footgun.
- **No bundler for the client** — Chrome loads ES modules directly; the normalizer is vendored + drift-guarded.
- **CI split into `server.yml`/`client.yml` + separate `deploy.yml`/`release.yml`/`publish-chrome-store.yml`**,
  each CI job also running the cross-cutting tests because `shared/` is a real cross-folder dependency.
- **Placeholder icons** generated by a built-in PNG encoder — replace before a store submission.
