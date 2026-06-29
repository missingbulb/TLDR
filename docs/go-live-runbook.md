# TLDR — go-live runbook

The single document to take TLDR from **nothing** (no AWS account, no Chrome Web Store account) to a
**published, working** extension. Follow it top to bottom. Every command is copy-pasteable; every value you
must supply is a `<PLACEHOLDER>` you fill in once and reuse.

> **Why this order.** There's a chicken-and-egg: the extension's sign-in (`https://<EXTENSION_ID>.chromiumapp.org/`)
> and the server's CORS lock (`chrome-extension://<EXTENSION_ID>`) both need the **extension id**, but Chrome only
> assigns a *permanent* id when you first upload the package to the Web Store. So we **reserve the id first**
> (Phase 1, a draft upload — no public review), then wire OAuth and AWS to it, then submit for review last.

## Values you'll collect (fill these in as you go)

| Token | Where it's set | Filled in (Phase) |
|-------|----------------|-------------------|
| `<EXTENSION_ID>` | from the CWS dashboard after the first draft upload | 1 |
| `<EXTENSION_PUBLIC_KEY>` | CWS dashboard → Package → "View public key" (one line, no newlines) | 1 |
| `<GOOGLE_CLIENT_ID>` | Google Cloud OAuth **Web application** client id (`…apps.googleusercontent.com`) | 2 |
| `<AWS_ACCOUNT_ID>` | your AWS account number | 3 |
| `<AWS_DEPLOY_ROLE_ARN>` | the OIDC deploy role ARN | 3 |
| `<EMAIL_HASH_SALT>` | a long random string you invent (keep secret) | 3 |
| `<API_URL>` | app-stack output `ApiUrl` (dev origin) | 3 |
| `<API_DOMAIN>` | app-stack output `ApiDomain` (CDN origin input) | 3 |
| `<CLOUDFRONT_DOMAIN>` | CDN-stack output `DistributionDomainName` (prod origin) | 4 |
| `<PRIVACY_POLICY_URL>` | a public URL hosting your privacy policy | 7 |
| `<CHROME_CLIENT_ID>` / `<CHROME_CLIENT_SECRET>` / `<CHROME_REFRESH_TOKEN>` | CWS API publish creds | 6 (optional) |

---

## Phase 0 — Accounts & prerequisites (no code yet)

- [ ] **0.1** A **Google account** you'll use as the owner (for Google Cloud + the Chrome Web Store dashboard).
- [ ] **0.2** A **credit/debit card** — needed for the $5 Chrome Web Store fee (Phase 1) and the AWS account (Phase 3, free-tier but a card is required).
- [ ] **0.3** Local tools, if you'll deploy/build from your machine (you can also do everything through GitHub CI — noted per step):
  - [ ] Node.js 22 (`node -v` → v22.x)
  - [ ] AWS CLI v2 (`aws --version`)
  - [ ] AWS SAM CLI (`sam --version`)
  - [ ] Chromium/Chrome 114+ (the manifest's `minimum_chrome_version`)
- [ ] **0.4** Confirm the repo is `missingbulb/tldr` and you push to `main` — the OIDC trust policy and CI are scoped to exactly that (`docs/architecture.md` §8.4).

---

## Phase 1 — Reserve the permanent extension id (Chrome Web Store)

This phase **creates the store item as a draft** so Chrome assigns the permanent id. **No public review happens here.**

- [ ] **1.1 Register as a Chrome Web Store developer.** Go to the
  [Developer Dashboard](https://chrome.google.com/webstore/devconsole), sign in with your owner Google account,
  accept the agreement, and pay the **one-time $5** registration fee. (Covers up to 20 items; you never pay it again.)

- [ ] **1.2 Build a first zip with the current placeholders.** The placeholders (`api.tldr.example`, the placeholder
  client id) are valid enough to package and reserve an id — you'll replace them in Phase 5.
  ```bash
  cd client
  npm run build      # -> client/dist/tldr-extension.zip
  ```
  > ⚠️ Do **not** add a `key` to `manifest.json` yet — Chrome rejects a `key` field on the **first** upload
  > ("key field not allowed in manifest"). You add it in Phase 5, *after* you have the id.

- [ ] **1.3 Create the item.** Dashboard → **+ New item** → upload `client/dist/tldr-extension.zip`. **Do not submit.**

- [ ] **1.4 Record the permanent id.** The item's URL / details show the **Item ID** — a 32-char `a–p` string.
  → set `<EXTENSION_ID>`.

- [ ] **1.5 Record the public key.** Open the item → **Package** tab → **View public key**. Copy the text
  **between** `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----`, **remove all newlines** so it's one line.
  → set `<EXTENSION_PUBLIC_KEY>`. (Used in Phase 5 so your local *unpacked* build gets the same id and you can test
  sign-in before going public.)

---

## Phase 2 — Google OAuth "Web application" client (sign-in)

The extension signs in with a Google **ID token** (a JWT), which requires a **Web application** OAuth client —
**not** a "Chrome app" client (that yields an opaque access token the server's JWT authorizer can't validate;
`server/README.md` §1, `docs/architecture.md` §12-A1).

- [ ] **2.1** [Google Cloud Console](https://console.cloud.google.com/) → create a **dedicated project** for TLDR.
  Don't reuse a project from another extension: the **OAuth consent screen is per-project and user-facing** (app
  name/logo/support email shown on the sign-in dialog), so a shared project would brand TLDR's sign-in with the other
  app's name. A separate project also isolates quotas, billing, and suspension blast-radius. (You *can* add another
  Web-application client to an existing project — it works — but the shared consent screen is the reason not to.)
- [ ] **2.2** APIs & Services → **OAuth consent screen** → configure it (External; app name, support email).
- [ ] **2.3** APIs & Services → **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
- [ ] **2.4** Under **Authorized redirect URIs**, add **exactly**:
  ```
  https://<EXTENSION_ID>.chromiumapp.org/
  ```
  (trailing slash included; `<EXTENSION_ID>` from Phase 1.4).
- [ ] **2.5** Create, then copy the **client id** (`…apps.googleusercontent.com`). → set `<GOOGLE_CLIENT_ID>`.
  This one value is used in **three** places: the server authorizer audience (Phase 3), `client/config.mjs` (Phase 5),
  and the repo variable `GOOGLE_CLIENT_ID` (Phase 3).

---

## Phase 3 — AWS account + OIDC deploy role + app stack

CI deploys to AWS via **GitHub OIDC** — no long-lived AWS keys are ever stored (`docs/architecture.md` §8.4). The
region is **`il-central-1`** (Tel Aviv), pinned in `deploy.yml`.

### 3A. Create the AWS account
- [ ] **3.1** Sign up at [aws.amazon.com](https://aws.amazon.com/) (email, card, phone verification). Note your
  12-digit **account id** → set `<AWS_ACCOUNT_ID>`.
- [ ] **3.2** Secure the root user with MFA; create an admin IAM user/role for yourself for console work. (Don't use
  root for day-to-day, and never put root keys in CI.)

### 3B. Create the GitHub OIDC identity provider + deploy role
Do this once, in the AWS console (IAM) or CLI. Full policy text is in `server/README.md` §2.
- [ ] **3.3 IAM → Identity providers → Add provider → OpenID Connect:**
  - Provider URL: `https://token.actions.githubusercontent.com`
  - Audience: `sts.amazonaws.com`
- [ ] **3.4 Create a role** with this **trust policy** (locks it to this repo + `main` only):
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
          "token.actions.githubusercontent.com:sub": "repo:missingbulb/tldr:ref:refs/heads/main"
        }
      }
    }]
  }
  ```
- [ ] **3.5 Attach a least-privilege permissions policy** (CloudFormation + `lambda`, `apigateway`, `dynamodb`
  scoped to the table, `logs`, `iam:*Role`/`PassRole` for the exec role, and the SAM-managed S3 bucket). **Do not use
  `AdministratorAccess`** (`server/README.md` §2.3). Copy the role ARN → set `<AWS_DEPLOY_ROLE_ARN>`.

### 3C. Tell GitHub how to deploy (repo variables + secret)
GitHub → repo **Settings → Secrets and variables → Actions**. The deploy job stays *skipped* (gray, not red) until
both variables below exist (`deploy.yml` line 30).
- [ ] **3.6 Variables** tab → add:
  - `AWS_DEPLOY_ROLE_ARN` = `<AWS_DEPLOY_ROLE_ARN>`
  - `GOOGLE_CLIENT_ID` = `<GOOGLE_CLIENT_ID>`
  - `ALLOWED_EXTENSION_ORIGIN` = `chrome-extension://<EXTENSION_ID>` *(recommended — without it the deploy defaults CORS to `*`)*
  - *(optional)* `CDN_PRICE_CLASS` = `PriceClass_200` *(default is `PriceClass_100`)*
- [ ] **3.7 Secrets** tab → add:
  - `EMAIL_HASH_SALT` = `<EMAIL_HASH_SALT>` — a long random string you invent. It salts the stored one-way email
    hash used for moderation; without it the hash is unsalted (`docs/architecture.md` §11, item 4).

### 3D. Deploy the app stack
**Either** let CI do it (recommended):
- [ ] **3.8a** Merge any change under `server/**`, `shared/**`, or `.github/workflows/deploy.yml` to `main` (or run the
  **deploy** workflow manually via **Actions → deploy → Run workflow**). With 3.6/3.7 set, it runs `sam build && sam deploy`.

**Or** deploy once from your machine to eyeball the first changeset:
- [ ] **3.8b**
  ```bash
  cd server
  npm ci
  sam build
  sam deploy --parameter-overrides \
    "GoogleClientId=<GOOGLE_CLIENT_ID> AllowedExtensionOrigin=chrome-extension://<EXTENSION_ID> EmailHashSalt=<EMAIL_HASH_SALT>"
  ```
  > ⚠️ **Read the changeset.** `Replacement: True` on `CommentsTable` is a **hard stop** — it would make a new empty
  > table and the data would not follow (`server/README.md` "Deploy discipline").

- [ ] **3.9 Record stack outputs:** `ApiUrl` → set `<API_URL>`; `ApiDomain` → set `<API_DOMAIN>`.
  (CLI: `aws cloudformation describe-stacks --stack-name tldr-app --query "Stacks[0].Outputs" --region il-central-1`.)

### 3E. One-time hardening (after the first successful deploy)
- [ ] **3.10** Enable stack termination protection (not expressible in the template):
  ```bash
  aws cloudformation update-termination-protection --enable-termination-protection \
    --stack-name tldr-app --region il-central-1
  ```
- [ ] **3.11** In the console, confirm the DynamoDB table's **Point-in-time recovery** is **on**.

> **Smoke test now (optional but recommended):** `curl "<API_URL>/comments?pageUrl=https://example.com/articles/42"`
> should return `200` with `{"comments":[]}`. That proves public reads work before you touch the CDN or the client.

---

## Phase 4 — CDN stack (production reads)

CloudFront fronts the API so most reads are served from the edge. It's a **separate, slow** stack (~15–20 min) —
deploy it once for prod; skip it while iterating (in dev the extension can hit `<API_URL>` directly).

- [ ] **4.1** Deploy via CI: **Actions → deploy → Run workflow**, check **"Also deploy the CDN stack"**. It reads the
  app stack's `ApiDomain` automatically and deploys CloudFront.

  *Or* from your machine:
  ```bash
  cd server
  sam deploy --config-env cdn --template cdn-template.yaml \
    --parameter-overrides "ApiDomain=<API_DOMAIN> PriceClass=PriceClass_200"
  ```
- [ ] **4.2** Record the CDN output `DistributionDomainName` → set `<CLOUDFRONT_DOMAIN>` (e.g. `dxxxx.cloudfront.net`).
- [ ] **4.3** Smoke test: `curl "https://<CLOUDFRONT_DOMAIN>/comments?pageUrl=https://example.com/articles/42"` → `200`.

---

## Phase 5 — Wire the client to the live backend, and lock the id

Now the client stops pointing at placeholders.

- [ ] **5.1 `client/config.mjs`** — replace both values:
  ```js
  export const API_BASE_URL = 'https://<CLOUDFRONT_DOMAIN>';   // prod (no trailing slash). Dev: use <API_URL>.
  export const GOOGLE_CLIENT_ID = '<GOOGLE_CLIENT_ID>';
  ```
- [ ] **5.2 `client/manifest.json` → `host_permissions`** — replace `https://api.tldr.example/*` with your origin:
  ```json
  "host_permissions": ["https://<CLOUDFRONT_DOMAIN>/*"]
  ```
- [ ] **5.3 Add the signing `key`** (now allowed — it's no longer the first upload) so the local *unpacked* build gets
  the **same** id as the store, letting you test sign-in end-to-end before publishing. In `client/manifest.json`:
  ```json
  "key": "<EXTENSION_PUBLIC_KEY>"
  ```
- [ ] **5.4 Replace the placeholder icons.** `client/icons/` are placeholders (`client/README.md`); real icons (16/32/48/128 px)
  are required for the store. Drop in real PNGs at those paths (the same names the manifest references).
- [ ] **5.5 Test locally end-to-end.** `chrome://extensions` → Developer mode → **Load unpacked** → select `client/`.
  Confirm the id matches `<EXTENSION_ID>`, open the side panel on a normal `https://` page, verify reads load and that
  signing in + posting a note works (this exercises the Phase 2 redirect URI and Phase 3 CORS origin).
- [ ] **5.6 Commit** these changes (and bump version — Phase 6).

---

## Phase 6 — Cut a release (build + GitHub Release zip)

Releases are driven by **bumping the version** (`release.yml`). The version in `client/manifest.json` and
`client/package.json` **must match** and be `X.Y.Z`.

- [ ] **6.1** Bump both files together (e.g. `0.1.0` → `1.0.0`) and merge to `main`. The **release** workflow builds the
  zip, runs tests, and publishes a GitHub Release `v<version>` with `tldr-extension.zip` attached.
- [ ] **6.2 (Optional) Set up CI publishing creds** so future versions push to the store from CI
  (`publish-chrome-store.yml` needs four secrets). Generate them with the helper:
  1. Google Cloud → new project (e.g. `chrome-webstore-upload`) → **OAuth consent screen** (Internal) → **Create OAuth client** → type **Desktop app**. Save its client id + secret.
  2. Enable the **Chrome Web Store API** for that project.
  3. Run `npx --yes chrome-webstore-upload-keys` and complete the browser approval to get the **refresh token**.
     (See <https://github.com/fregante/chrome-webstore-upload-keys>.)
  4. Add repo **Secrets**: `CHROME_EXTENSION_ID`=`<EXTENSION_ID>`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.

  > Note: these are a **separate** OAuth client (Desktop, for *uploading*) from the Phase-2 Web-application client (for *sign-in*). Don't mix them up.

---

## Phase 7 — Chrome Web Store listing + submit for review

Back in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), open the item you created in Phase 1.

- [ ] **7.1 Upload the final package.** Either drag the released `tldr-extension.zip` into the item, **or** run
  **Actions → publish-chrome-store → Run workflow** (uncheck *auto-publish* to upload as a draft first if you set up 6.2).
- [ ] **7.2 Store listing** tab: description, category, language, at least one **screenshot** (1280×800 or 640×400),
  and small/marquee tiles as prompted.
- [ ] **7.3 Privacy** tab (this gates approval — TLDR uses `identity`, `storage`, `tabs`, `webNavigation`, and host
  permissions, and collects a Google identity + user-posted text):
  - [ ] **Single purpose** — one clear sentence (e.g. *"Show and post short community notes attached to the current web page."*).
  - [ ] **Per-permission justification** — one line each for `identity`, `sidePanel`, `storage`, `tabs`, `webNavigation`, and the host permission. Be specific about *why*.
  - [ ] **Data usage** disclosures — declare that you collect authentication info (Google account) and user content (the note text); check the certification boxes.
  - [ ] **Privacy policy URL** = `<PRIVACY_POLICY_URL>` — **required** and must be publicly reachable. Host a short policy (what you store: a salted email hash + note text + author name/id; that raw email is never stored or shared) and paste the URL.
- [ ] **7.4 Submit for review.** Approval typically takes a few days to a couple of weeks. You'll get an email on
  approval or rejection (rejections name the policy + the fix).

> **Don't submit until Phase 5.5 passed** — a reviewer who opens the panel and sees broken reads/sign-in can reject under
> the "functions as described" policy. The whole point of the ordering is that by Phase 7 it actually works.

---

## Phase 8 — Post-approval verification

- [ ] **8.1** Install the **published** extension from its store URL (a fresh profile, not your unpacked dev load).
- [ ] **8.2** Confirm the id still equals `<EXTENSION_ID>` (it will — the `key` guarantees it), so the Phase-2 redirect
  and Phase-3 CORS origin keep matching.
- [ ] **8.3** On a normal page: reads load; sign in; post a note; confirm it appears for a second viewer within the CDN
  TTL (~30–60 s) — the author sees it instantly via optimistic render (`docs/architecture.md` §6.2).
- [ ] **8.4** Watch CloudWatch logs / costs for the first day. Then revisit the deferred items in
  `docs/architecture.md` §10 (edge throttling, reserved concurrency) once you see real traffic.

---

## Quick dependency map (what blocks what)

```
Phase 1 (reserve id) ──> Phase 2 (OAuth redirect needs id)
        └─────────────> Phase 3 (CORS origin needs id) ──> Phase 4 (CDN needs app stack)
Phase 2 (client id) ───> Phase 3 (authorizer audience)        │
Phase 4 (CDN domain) ──> Phase 5 (client config) ──> Phase 6 (release) ──> Phase 7 (submit) ──> Phase 8 (verify)
Phase 5 needs the public key from Phase 1.5.
```

## References (in-repo)
- `server/README.md` — exact OIDC policies, deploy commands, hardening.
- `client/README.md` — id/key mechanics, build, configure.
- `docs/architecture.md` — the as-built design and the §11 owner-input list this runbook operationalizes.
- Workflows: `.github/workflows/deploy.yml`, `release.yml`, `publish-chrome-store.yml`.
