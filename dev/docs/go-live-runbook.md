# TLDR — go-live runbook

The single document to take TLDR from **nothing** (no AWS account, no Chrome Web Store account) to a
**published, working** extension. Follow it top to bottom.

> **No local machine.** Development happens entirely on Claude Code Web VMs and in GitHub CI — there's no local
> checkout, no `npm run build` on your laptop, no "load unpacked." File edits land via commits; the extension zip
> and the AWS deploy are produced by **CI**. Every value you must supply is a `<PLACEHOLDER>` you set once (almost
> always as a GitHub **repository variable/secret**, never hand-edited into source).

> **Why this order.** There's a chicken-and-egg: the extension's sign-in redirect (`https://<EXTENSION_ID>.chromiumapp.org/`)
> and the publish flow both need the **extension id**, but Chrome only assigns a *permanent* id when you first upload
> the package to the Web Store. So we **reserve the id first** (Phase 1, a draft upload — no public review), then wire
> OAuth and AWS, then submit for review last.

## Values you'll collect (set as GitHub Variables/Secrets unless noted)

| Token | Where it comes from | GitHub home | Phase |
|-------|---------------------|-------------|-------|
| `<EXTENSION_ID>` | CWS dashboard, after the first draft upload | Secret `CHROME_EXTENSION_ID` | 1 |
| `<EXTENSION_PUBLIC_KEY>` | CWS dashboard → Package → "View public key" (one line, no newlines) | Variable `EXTENSION_PUBLIC_KEY` | 1 |
| `<GOOGLE_CLIENT_ID>` | Google OAuth **Web application** client id | Variable `GOOGLE_CLIENT_ID` | 2 |
| `<AWS_ACCOUNT_ID>` | your AWS account number | — | 3 |
| `<AWS_DEPLOY_ROLE_ARN>` | the OIDC deploy role ARN | Variable `AWS_DEPLOY_ROLE_ARN` | 3 |
| `<EMAIL_HASH_SALT>` | a long random string you invent | Secret `EMAIL_HASH_SALT` | 3 |
| `<API_DOMAIN>` | app-stack output `ApiDomain` | — (CDN input) | 3 |
| `<CLOUDFRONT_DOMAIN>` | CDN-stack output `DistributionDomainName` | → `API_BASE_URL` variable | 4 |
| `<PRIVACY_POLICY_URL>` | a public URL hosting your privacy policy | — | 7 |
| `<CHROME_CLIENT_ID>` / `<CHROME_CLIENT_SECRET>` / `<CHROME_REFRESH_TOKEN>` | CWS API publish creds | Secrets | 6 |

### Secret vs. public — what goes where

Most of these are **public**, not secrets. Don't over-protect them:

- **Public** → GitHub repo **Variables** (and the client id / key ship inside the extension anyway): `GOOGLE_CLIENT_ID`, `EXTENSION_PUBLIC_KEY`, `API_BASE_URL`, `AWS_DEPLOY_ROLE_ARN`, `ALLOWED_EXTENSION_ORIGIN`.
- **Genuine secrets** → GitHub repo **Secrets**: `EMAIL_HASH_SALT`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`. (`CHROME_EXTENSION_ID` / `CHROME_CLIENT_ID` live in Secrets for convenience but aren't themselves sensitive.)
- **Not used at all:** the Google **client *secret*** from the Phase-2 Web-application client. Sign-in uses `response_type=id_token`, which needs only the client *ID*.

### How config reaches the shipped extension — build-time injection

The committed `client/config.mjs` and `client/manifest.json` carry only **placeholders**, forever. The release build
(`client/scripts/build-zip.mjs`) injects the real values into *staged copies* from three repository variables, so
nothing real is committed:

| Variable | Injected into |
|----------|---------------|
| `API_BASE_URL` | `config.mjs` `API_BASE_URL` **and** `manifest.json` `host_permissions` (`<origin>/*`) |
| `GOOGLE_CLIENT_ID` | `config.mjs` `GOOGLE_CLIENT_ID` |
| `EXTENSION_PUBLIC_KEY` | `manifest.json` `key` (pins the extension id) |

`release.yml` fails fast if any of the three is missing, so a release can't silently ship placeholders.

---

## Phase 0 — Accounts & prerequisites

- [ ] **0.1** A **Google account** (for Google Cloud + the Chrome Web Store dashboard).
- [ ] **0.2** A **card** — the $5 Chrome Web Store fee (Phase 1) and the AWS account (Phase 3; free-tier, card required).
- [ ] **0.3** That's it — no local toolchain. Builds and deploys run in CI / the VM.
- [ ] **0.4** Confirm the repo is **`missingbulb/TLDR`** (canonical casing) and you push to `main`. CI runs workflows from `main`, and the OIDC trust policy is scoped to exactly that repo+branch. **Casing matters** — see Phase 3.4.

---

## Phase 1 — Reserve the permanent extension id (Chrome Web Store)

Creates the store item as a **draft** so Chrome assigns the permanent id. **No public review here.**

- [ ] **1.1 Register** at the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), accept the agreement, pay the **one-time $5** (covers up to 20 items).
- [ ] **1.2 Get a first zip.** It just needs to be a valid package with the current placeholders — you're only reserving the id. The zip is produced by CI/the VM (ask Claude to build & send `client/dist/tldr-extension.zip`, or download it from a GitHub Release).
  > ⚠️ The first upload must have **no `key`** in the manifest — Chrome rejects a `key` field on a brand-new item ("key field not allowed in manifest"). The committed manifest has none, so a plain build is correct here.
- [ ] **1.3 Create the item.** Dashboard → **+ New item** → upload the zip. **Do not submit.**
- [ ] **1.4 Record the id.** The item URL shows the **Item ID** (32-char `a–p`). → set `<EXTENSION_ID>`.
- [ ] **1.5 Record the public key.** Item → **Package** tab → **View public key** → copy the text **between** the `BEGIN/END PUBLIC KEY` lines, **strip all newlines** to one line. → set `<EXTENSION_PUBLIC_KEY>`.

---

## Phase 2 — Google OAuth "Web application" client (sign-in)

Sign-in uses a Google **ID token** (JWT), which needs a **Web application** OAuth client — not a "Chrome app" client
(that yields an opaque access token the JWT authorizer can't validate; `dev/docs/architecture.md` §12-A1).

> Google's console is now the **"Google Auth Platform"** UI: the old "OAuth consent screen" is split into **Branding** +
> **Audience**, and OAuth clients live under **Clients**.

- [ ] **2.1** [Google Cloud Console](https://console.cloud.google.com/) → create a **dedicated project** for TLDR. Don't reuse another extension's project — the consent screen is per-project and user-facing, so it'd brand TLDR's sign-in with the other app's name (and a dedicated project isolates quotas/billing).
- [ ] **2.2 Branding** → set **App name** + **User support email**.
- [ ] **2.3 Audience** → **User type = External**. Since TLDR uses only basic sign-in scopes (no verification needed), **Publish app** (avoids 7-day test-mode token expiry and lets real users sign in). *(Or add yourself as a Test user to stay in Testing for now.)*
- [ ] **2.4 Clients** → **Create client** → **Web application** → name it → save. Copy the **Client ID** (`…apps.googleusercontent.com`). → set `<GOOGLE_CLIENT_ID>`. Ignore the client secret.
- [ ] **2.5** In that client, add **Authorized redirect URI** (needs `<EXTENSION_ID>` from Phase 1):
  ```
  https://<EXTENSION_ID>.chromiumapp.org/
  ```
- [ ] **2.6** Add `<GOOGLE_CLIENT_ID>` as repo **Variable** `GOOGLE_CLIENT_ID` (read by both the server deploy and the client build).

---

## Phase 3 — AWS account + OIDC deploy role + app stack

CI deploys to AWS via **GitHub OIDC** — no long-lived keys (`dev/docs/architecture.md` §8.4). Region **`il-central-1`** (Tel Aviv), pinned in `deploy.yml`.

### 3A. Create the AWS account
- [ ] **3.1** Sign up at [aws.amazon.com](https://aws.amazon.com/). Note the 12-digit **account id** → `<AWS_ACCOUNT_ID>`.
- [ ] **3.2** MFA on the root user; do console work as an admin IAM identity (not root).
- [ ] **3.3** **Enable the `il-central-1` region** (account menu → Account → AWS Regions) — it's opt-in, and the deploy is pinned to it.

### 3B. OIDC provider + deploy role
- [ ] **3.4 IAM → Identity providers → Add provider → OpenID Connect:** URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
- [ ] **3.5 IAM → Roles → Create role → Custom trust policy** → paste (fill in `<AWS_ACCOUNT_ID>`), name it `tldr-github-deploy`:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
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
  > ⚠️ **Casing matters.** GitHub's OIDC `sub` claim uses the repo's *canonical* casing (`missingbulb/TLDR`), and IAM `StringEquals` is case-sensitive. Listing both casings avoids a silent `Not authorized to perform sts:AssumeRoleWithWebIdentity`.
- [ ] **3.6 Attach the permissions policy** (inline) — the full JSON is in [`server/README.md`](../server/README.md) §2.3. Key points: `cloudformation:*` and `cloudfront:*` are service-wide (`Resource: "*"`) because change-set creation authorizes against the SAM **transform** macro ARN and the SAM-managed bucket stack, and CloudFront ARNs aren't region-scoped; the data-plane (`lambda`/`apigateway`/`dynamodb`/`logs`/`iam`/`s3`) stays scoped to this stack. **Not** `AdministratorAccess`. Copy the role ARN → `<AWS_DEPLOY_ROLE_ARN>`.

### 3C. Repo variables + secret
GitHub → **Settings → Secrets and variables → Actions**. The deploy job stays *skipped* (gray) until both gating variables exist (`deploy.yml`).
- [ ] **3.7 Variables:**
  - `AWS_DEPLOY_ROLE_ARN` = `<AWS_DEPLOY_ROLE_ARN>`
  - `GOOGLE_CLIENT_ID` = `<GOOGLE_CLIENT_ID>` *(from 2.6)*
  - `ALLOWED_EXTENSION_ORIGIN` — **leave unset** (`deploy.yml` defaults it to `*`), or set it to `*` explicitly. It **must resolve to `*`**: API Gateway HTTP API v2 **rejects** `chrome-extension://` origins ("Invalid format for origin"). Safe: writes are JWT-gated, reads public, and the extension reaches the API via `host_permissions`, not browser CORS (`dev/docs/architecture.md` §12-A9).
  - *(optional)* `CDN_PRICE_CLASS` = `PriceClass_200`
- [ ] **3.8 Secret:** `EMAIL_HASH_SALT` = a long random string (salts the stored one-way email hash; set once and don't rotate).

### 3D. Deploy
- [ ] **3.9** Actions → **deploy** → **Run workflow** (on `main`). It assumes the role via OIDC and runs `sam build && sam deploy`, then enables stack **termination protection automatically** (a workflow step — no manual CLI). On success it prints the `ApiUrl` / `ApiDomain` outputs in the log. → set `<API_DOMAIN>`.
  > ⚠️ **Read the changeset on any schema change.** `Replacement: True` on `CommentsTable` is a hard stop — it makes a new empty table and the data doesn't follow.
  > **First-deploy rollback gotcha:** if a `CREATE` fails and rolls back, the `Retain`-protected `tldr-comments` table is **kept** (orphaned). Before retrying, delete the `ROLLBACK_COMPLETE` stack **and** the orphaned table (empty, so safe), or the next deploy fails with "table already exists."
- [ ] **3.10 Smoke test:** `curl "https://<API_DOMAIN>/comments?pageUrl=https://example.com/articles/42"` → `200 {"comments":[]}`.

---

## Phase 4 — CDN stack (production reads)

CloudFront fronts the API so reads are edge-cached. Separate, **slow** stack (~15–20 min to propagate).

- [ ] **4.1** Actions → **deploy** → **Run workflow** → tick **"Also deploy the CDN stack"**. It reads `ApiDomain` automatically.
  > The CDN stack creates a `CloudFront::CachePolicy` then a `Distribution` — this is why the deploy role needs `cloudfront:*` (3.6). On a failed `CREATE`, delete the `ROLLBACK_COMPLETE` `tldr-cdn` stack before retrying (nothing is retained).
  > ⚠️ **New-account CloudFront gate.** A brand-new AWS account often can't create a CloudFront `Distribution` until AWS verifies it (`AccessDenied: "Your account must be verified before you can add new CloudFront resources"`). This is an AWS account-level block, **not** an IAM/template issue — open a free AWS Support case (Account & billing) to enable CloudFront; it clears in hours to a couple of days. **You don't have to wait:** the CDN is an optimization, so you can launch by pointing `API_BASE_URL` at the app `ApiUrl` directly and add the CDN later by re-pointing it.
- [ ] **4.2** From the run log, record `DistributionDomainName` → `<CLOUDFRONT_DOMAIN>` (e.g. `dxxxx.cloudfront.net`).
- [ ] **4.3** Smoke test: `curl "https://<CLOUDFRONT_DOMAIN>/comments?pageUrl=https://example.com/articles/42"` → `200`.

---

## Phase 5 — Point the client at the live backend (set variables, replace icons)

No code editing — the build injects config from variables (see top). You only set variables and replace icons.

- [ ] **5.1** Set repo **Variable** `API_BASE_URL` = `https://<CLOUDFRONT_DOMAIN>` (no trailing slash). *(Dev alternative: the app `ApiUrl` directly.)*
- [ ] **5.2** Confirm the other two release variables are set: `GOOGLE_CLIENT_ID` (2.6) and `EXTENSION_PUBLIC_KEY` (Phase 1.5). With all three set, the release build injects `config.mjs` + `manifest.json` (host_permissions + `key`) automatically.
- [ ] **5.3 Replace the placeholder icons.** `client/icons/` ship placeholder PNGs (16/32/48/128). Commit real icons at the same paths (a real listing requires them). *(This is the one committed file change in this phase — done via a commit, not a local edit.)*

---

## Phase 6 — Cut a release (build + GitHub Release zip)

> ⚠️ **Merge to `main` first.** CI runs workflows and the build from `main`. The config-injection build, the fail-fast guard, and the termination-protection step must be on `main` — a release cut before they land would ship **placeholder config**. Bumping the version is the release trigger, so the bump must be *on `main`*.

- [ ] **6.1** Bump the version in `client/manifest.json` **and** `client/package.json` together (must match, `X.Y.Z`) and land on `main`. The **release** workflow tests, builds the injected zip, and publishes GitHub Release `v<version>` with `tldr-extension.zip` attached. (Fails fast if `API_BASE_URL`/`GOOGLE_CLIENT_ID`/`EXTENSION_PUBLIC_KEY` aren't set.)
- [ ] **6.2 CI publishing creds** (so `publish-chrome-store.yml` can ship): in a Google Cloud project, enable the **Chrome Web Store API**, create a **Desktop app** OAuth client, then `npx --yes chrome-webstore-upload-keys` for the refresh token (see <https://github.com/fregante/chrome-webstore-upload-keys>). Add Secrets `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.
  > These are a **separate** OAuth client (Desktop, for *uploading*) from the Phase-2 Web-application client (for *sign-in*).

---

## Phase 7 — Chrome Web Store listing + submit for review

Open the item from Phase 1 in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

- [ ] **7.1 Upload the final package** — drag the released `tldr-extension.zip` in, or run **Actions → publish-chrome-store → Run workflow** (uncheck *auto-publish* to upload as a draft first).
- [ ] **7.2 Store listing:** description, category, language, a **screenshot** (1280×800 or 640×400), tiles.
- [ ] **7.3 Privacy tab** (gates approval — TLDR uses `identity`, `storage`, `tabs`, `webNavigation`, host permissions, and collects a Google identity + user text):
  - [ ] **Single purpose:** *"Show and post short community 'tl;dr' notes attached to the web page the user is currently viewing."*
  - [ ] **Per-permission justification** (each grounded in actual code use):

    | Field | Justification |
    |-------|---------------|
    | `identity` | Sign the user in with Google via `launchWebAuthFlow` to obtain an ID token, only when they choose to post a note. |
    | `sidePanel` | The entire UI is a side panel listing notes for the current page and letting the user post one. |
    | `storage` | The user's per-site on/off list (`chrome.storage.sync`) + a short-lived sign-in token cache (`chrome.storage.session`). No browsing data. |
    | `tabs` | Read the active tab's URL to fetch the notes for the page being viewed, and refresh on tab switch. |
    | `webNavigation` | Detect in-page (SPA) navigations so the list refreshes when the URL changes without a full reload. |
    | Host permission | The single backend the extension talks to, to read/post notes. No other host. |

  - [ ] **Data usage:** declare **Authentication information** (Google sign-in) + **User-generated content** (note text); check the three certifications (no selling, no unrelated use, no creditworthiness use). Raw email is never stored (only a salted hash), so don't declare email collection.
  - [ ] **Privacy policy URL** (**required**, public). The page is rendered from [`dev/docs/privacy-policy.md`](privacy-policy.md) and published to GitHub Pages at `/privacy/` by the **publish-privacy** workflow. One-time: **Settings → Pages → Source = "GitHub Actions"**, then the workflow runs on push to `main` (or dispatch it). Paste the live URL — shown in the workflow's `deploy` step output and under Settings → Pages (typically `https://missingbulb.github.io/TLDR/privacy/`).
- [ ] **7.4 Submit for review** (approval: a few days to a couple of weeks).

> **Don't submit until it actually works.** Without a local Chrome to "load unpacked," verify against a **draft/unlisted store install** first — a reviewer who opens a broken panel can reject under "functions as described."

---

## Phase 8 — Post-approval verification

- [ ] **8.1** Install the **published** extension from its store URL (fresh profile).
- [ ] **8.2** Confirm the id equals `<EXTENSION_ID>` (the injected `key` guarantees it), so the OAuth redirect keeps matching.
- [ ] **8.3** On a normal page: reads load; sign in; post a note; confirm it appears for a second viewer within the CDN TTL (~30–60 s); the author sees it instantly via optimistic render.
- [ ] **8.4** Watch CloudWatch logs / costs for the first day; revisit the deferred items in `dev/docs/architecture.md` §10.

---

## Quick dependency map

```
Phase 1 (reserve id) ──> Phase 2 (OAuth redirect + CHROME_EXTENSION_ID need the id)
Phase 2 (client id) ───> Phase 3 (authorizer audience)
Phase 3 (app stack) ───> Phase 4 (CDN) ──> Phase 5 (API_BASE_URL variable)
Phase 1.5 public key ─> EXTENSION_PUBLIC_KEY variable (injected at build)
Phases 2/4/5 set the three release variables ──> Phase 6 (release, on main) ──> Phase 7 (submit) ──> Phase 8 (verify)
```

## References (in-repo)
- `server/README.md` — OIDC trust policy (+ casing), the full deploy permissions policy, CORS (`*`), hardening.
- `client/README.md` — build-time config injection, the `key`, icons.
- `dev/docs/architecture.md` — as-built design; §12-A9 (CORS) and the §11 owner-input list this operationalizes.
- Workflows: `.github/workflows/deploy.yml` (deploy + termination protection), `release.yml` (injected build), `publish-chrome-store.yml`.
