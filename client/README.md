# TLDR client (Chrome extension, MV3)

A side-panel extension that shows community tl;dr notes for the active page and lets a signed-in
user post one. No bundler — Chrome loads the ES modules directly.

## Layout
```
client/
├── manifest.json            # MV3 manifest (least-privilege; no <all_urls>)
├── config.mjs               # OWNER-EDITED: API_BASE_URL + GOOGLE_CLIENT_ID
├── src/
│   ├── service-worker.mjs   # opens the side panel on toolbar click; seeds the denylist
│   ├── sidepanel.{html,css,mjs}  # the UI + read/post orchestration
│   ├── options.{html,mjs}   # edit the user denylist
│   ├── auth.mjs             # Google ID-token flow (launchWebAuthFlow) — pure helpers are tested
│   ├── api.mjs              # GET (public) + POST (bearer) client — tested
│   ├── denylist.mjs         # two-layer page gate — tested
│   └── optimistic.mjs       # optimistic-render bookkeeping — tested
├── vendor/normalizeUrl.GENERATED.mjs  # byte-identical copy of shared/normalizeUrl.mjs (drift-guarded)
├── icons/                   # PLACEHOLDER icons (replace before a store submission)
├── scripts/                 # build-zip + gen-icons (dev only; never shipped)
└── test/                    # node --test unit tests
```

## Configure (before building/loading)
1. **`config.mjs`** — set `API_BASE_URL` (dev: the app stack `ApiUrl`; prod: `https://<cloudfront-domain>`)
   and `GOOGLE_CLIENT_ID` (the Google "Web application" client id — see `server/README.md`).
2. **`manifest.json` → `host_permissions`** — change `https://api.tldr.example/*` to your API/CloudFront host.

## The extension id (and why it matters)
The OAuth redirect URI is `https://<EXTENSION_ID>.chromiumapp.org/`, and CORS is locked to
`chrome-extension://<EXTENSION_ID>`. So the id must be **stable**:
- **Unpacked dev:** Chrome derives the id from the load path; run `chrome.identity.getRedirectURL()`
  in the side panel devtools to read the exact redirect URI, and register that on the Google client.
- **Stable id across machines / for production:** add a `"key"` to `manifest.json` (the public key of
  a keypair, or the key Chrome shows for your uploaded Web Store item). It is intentionally omitted
  here because an invalid `"key"` makes the manifest fail to load — add the real one when you have it.

## Build
```bash
cd client
npm run build      # -> dist/tldr-extension.zip (only the shippable files)
```
Load unpacked for development: `chrome://extensions` → Developer mode → **Load unpacked** → select `client/`.

## How it works
- The side panel fetches comments **only while open** (the dominant cost lever) for the **active tab**,
  refetching (debounced) on tab/URL/SPA-history changes.
- A page is skipped if it fails the two-layer denylist (Layer 1 code constant: non-http(s) + the Web
  Store; Layer 2: the user denylist in `chrome.storage.sync`, seeded with `localhost`/`127.0.0.1`).
- **Reads are public** and sent without an Authorization header (cache-friendly). **Posting** mints a
  Google **ID token** via `chrome.identity.launchWebAuthFlow` (nonce/state verified), attaches it as a
  bearer token, and renders the new note optimistically before the CDN TTL lets others see it.

## Tests
`npm test` — pure logic (denylist, auth helpers, api, optimistic) + manifest/packaging guards.
The `chrome.*` glue (service worker, side panel, options) is validated by `node --check` in CI; full
end-to-end in a real browser is a deliberate v1 follow-up.
