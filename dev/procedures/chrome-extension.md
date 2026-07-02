# Chrome extension (MV3) — lessons

Notes for the TLDR extension under `client/`. These are largely portable; the distilled, project-stripped
versions are what would propagate to the corpus `technologies/chrome-extension.md`.

- **Authenticate with an ID token via `launchWebAuthFlow`, not `getAuthToken`.** Our backend validates a
  Google **ID token** (a JWT) at the API Gateway JWT authorizer, so the client must obtain an *ID token* —
  `chrome.identity.launchWebAuthFlow` with `response_type=id_token` against a Google Cloud OAuth client of
  type **Web application** (redirect `https://<extension-id>.chromiumapp.org/` from
  `chrome.identity.getRedirectURL()`, scope `openid email profile`), then **verify the returned `nonce`**.
  `chrome.identity.getAuthToken` returns an opaque OAuth *access* token (no verifiable signature/`iss`/`aud`)
  that the authorizer rejects. The extension id must be stable (manifest `key`) so the redirect URI is fixed.
  Worked example: `client/src/auth.mjs` (`buildAuthUrl` / `mintToken` / `getIdToken`); audience set in `server/template.yaml`.

- **No bundler needed — MV3 loads ES modules natively.** Declare the service worker `"type": "module"` and
  load page scripts with `<script type="module">`; relative imports resolve inside the packaged extension.
  We ship plain `.mjs` with no build step. Worked example: `client/manifest.json` (`background.type`),
  `client/src/sidepanel.html`, and the vendored `client/vendor/normalizeUrl.GENERATED.mjs` import.

- **A silent token refresh must use `prompt=none`.** `launchWebAuthFlow({interactive:false})` can only complete
  a flow that needs no UI, so the silent refresh requests `prompt=none`; `prompt=consent` always needs
  interaction and so always fails silently — reserve it (or omit `prompt`) for the interactive fallback.
  Worked example: `client/src/auth.mjs` (`mintToken` passes `prompt: interactive ? undefined : 'none'`).

- **`prompt=none` can't pick among multiple signed-in accounts — pass `login_hint`.** With several Google
  accounts signed in, a silent refresh with no account hint errors (Google can't choose without UI), so a
  *signed-in* user gets a needless prompt. Fix: remember the account **email** (the `email` claim — non-secret,
  not a credential) and pass it as `login_hint` on the silent mint (OIDC Core §3.1.2.1). Persist only the
  email to `storage.local`; the **ID token stays in `storage.session`** (in-memory) — never write a bearer
  credential to disk (extension storage is unencrypted), and don't adopt a refresh-token flow to "fix"
  restarts (that puts a *longer-lived* credential at rest — worse). Worked example: `client/src/auth.mjs`
  (`cacheToken` remembers the email; `loadLoginHint`/`buildAuthUrl` thread it through).

- **Escalate to interactive auth only from a real user gesture, and only as a last resort.** Reads send no
  token, so the panel-open/read path can't prompt. The write path must too: the first POST uses a
  silent-only token, and a *visible* Google prompt is permitted **only** on the 401 retry — which already
  runs inside the Post click. Encode it as a hard rule: `getIdToken` escalates to interactive **iff**
  `interactive && forceRefresh` (both default false), so no other caller can surface UI by accident. Worked
  example: `client/src/auth.mjs` (`getIdToken` escalation guard) + `client/src/api.mjs` (`postComment`
  silent-first, interactive-on-401). Unit-tested by stubbing `chrome.*` in `client/test/auth.test.mjs`.

- **Reach the API via the server's CORS, not `host_permissions`.** Our backend returns
  `Access-Control-Allow-Origin: *` (API Gateway CORS — it's `*` because HTTP API v2 rejects the
  `chrome-extension://` scheme), which already permits the extension origin, so the side-panel `fetch`es
  (public GET, Bearer POST; no cookies → not "credentialed") succeed under standard CORS with **no**
  `host_permissions` entry. Don't request a host permission for an API your server already CORS-allows —
  it only adds an install warning. (Conversely, a `host_permissions` grant alone wouldn't help if the
  server returned no usable CORS header.) Worked example: `CorsConfiguration` in `server/template.yaml`
  (allow `*`; `authorization`/`content-type` headers; `GET`/`POST`/`OPTIONS`).

- **A feature that needs REAL host access (not just reaching your own CORS-open API) can still avoid an
  install-time warning: `optional_host_permissions` + a user-gesture-bound `chrome.permissions.request()`
  + dynamic `chrome.scripting.registerContentScripts()`.** A content script that must run on arbitrary
  third-party pages (not just your own API's origin) genuinely needs a host grant — CORS on your server
  can't substitute. List the origins under `optional_host_permissions` (not `permissions`/
  `host_permissions`) and add the silent `"scripting"` permission; neither shows Chrome's install/update
  warning. Only request the grant from `chrome.permissions.request()` called **synchronously inside a
  real click handler** — Chrome requires a live user gesture and refuses the call from a background
  service-worker message, so the request must happen in the foreground page (options/popup) that has the
  gesture, not be proxied to the SW. On grant, register the content script **dynamically**
  (`chrome.scripting.registerContentScripts([...])`) — never declare it statically in `manifest.json`'s
  `content_scripts`, or its `matches` would need to already be a granted permission, defeating the
  opt-in. Self-heal on every service-worker start (`chrome.permissions.contains` vs. your persisted
  enabled flag): the grant can be revoked from `chrome://extensions` directly, bypassing your toggle.
  Worked example: `client/src/hover-registration.mjs` (register/unregister/reconcile) +
  `client/src/options.mjs` (the toggle click handler calling `chrome.permissions.request` directly) +
  `client/manifest.json` (`optional_host_permissions`, `scripting`, no static `content_scripts`).
