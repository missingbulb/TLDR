# TLDR client (Chrome extension, MV3)

A side-panel extension that shows community tl;dr notes for the active page and lets a signed-in
user post one. No bundler — Chrome loads the ES modules directly.

## Layout
```
client/
├── manifest.json            # MV3 manifest (least-privilege; no <all_urls>)
├── config.mjs               # API_BASE_URL + GOOGLE_CLIENT_ID (placeholders; injected at build time)
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

## Configuration (injected at build time)
The committed `config.mjs` `API_BASE_URL` points at the **dev** stack on purpose, so any build **not
produced by the release workflow** talks to dev — **never prod**. PROD is reachable in exactly one way:
the release workflow (`.github/workflows/release.yml`) injects the prod URL from a GitHub repository
variable at build time. That prod-pointed zip is **both** the GitHub Release artifact **and** what
`publish-chrome-store.yml` uploads to the store — so **downloading the release zip from GitHub is
prod**, while a plain/local/unpacked/`build:dev` build keeps the committed dev default. (`GOOGLE_CLIENT_ID`
and the manifest `key` stay placeholders, injected the same way.)
- **`API_BASE_URL`** — committed default = the **dev** app stack `ApiUrl`
  (`https://<id>.execute-api.<region>.amazonaws.com`); the release build overrides it with prod
  (`https://<cloudfront-domain>`) → `config.mjs` `API_BASE_URL`. The extension reaches the API via the
  server's `*` CORS, so **no** `manifest.json` `host_permissions` is injected. A test guards that the
  committed default is never a prod (CloudFront) URL. The committed value is the `ApiUrl` of
  `tldr-app-dev` in the **dev AWS account** — re-set it if the dev stack is ever torn down and recreated
  (API Gateway ids are random, so a recreate mints a new URL).
- **`GOOGLE_CLIENT_ID`** (the Google "Web application" client id — see `server/README.md`) →
  `config.mjs`.

## The extension id (and why it matters)
The OAuth redirect URI is `https://<EXTENSION_ID>.chromiumapp.org/`, so the id must be **stable**
(server CORS is `*`, not the extension origin — API Gateway v2 rejects the `chrome-extension://` scheme —
so the id matters for the redirect URI, not for API access):
- **Unpacked dev:** Chrome derives the id from the load path; run `chrome.identity.getRedirectURL()`
  in the side panel devtools to read the exact redirect URI, and register that on the Google client.
- **Stable id across machines / for production:** the manifest needs a `"key"` (the public key of a
  keypair, or the key Chrome shows for your uploaded Web Store item). It is omitted from the committed
  source because an invalid `"key"` makes the manifest fail to load; the build injects the real one
  from the `EXTENSION_PUBLIC_KEY` repository variable.

## Build
The shippable zip is produced by CI — the **Release: Create Package** workflow runs `npm run build`,
injecting the repo variables above into staged copies (the committed source is never touched). The
build itself runs anywhere; with no env set it produces a **dev-pointed** zip from the committed
defaults:
```bash
cd client
npm run build      # -> dist/tldr.zip (only the shippable files)
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
