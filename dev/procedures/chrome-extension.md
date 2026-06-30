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

- **Reach the API via the server's CORS, not `host_permissions`.** Our backend returns
  `Access-Control-Allow-Origin: *` (API Gateway CORS — it's `*` because HTTP API v2 rejects the
  `chrome-extension://` scheme), which already permits the extension origin, so the side-panel `fetch`es
  (public GET, Bearer POST; no cookies → not "credentialed") succeed under standard CORS with **no**
  `host_permissions` entry. Don't request a host permission for an API your server already CORS-allows —
  it only adds an install warning. (Conversely, a `host_permissions` grant alone wouldn't help if the
  server returned no usable CORS header.) Worked example: `CorsConfiguration` in `server/template.yaml`
  (allow `*`; `authorization`/`content-type` headers; `GET`/`POST`/`OPTIONS`).
