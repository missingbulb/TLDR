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

- **`host_permissions` does not bypass CORS.** Listing the API host lets the extension's fetches *reach* it,
  but the server must still return CORS headers for the extension origin (`chrome-extension://<id>`), or
  reads/writes fail in-browser despite correct client code. Worked example: `CorsConfiguration` in
  `server/template.yaml` (allow the extension origin; `authorization`/`content-type` headers; `OPTIONS`).
