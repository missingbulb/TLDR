# Chrome extension (MV3) — lessons

Notes for the TLDR extension under `extension/`. These are largely portable; the distilled, project-stripped
versions are what would propagate to the corpus `technologies/chrome-extension.md`.

- **`prompt=none` can't pick among multiple signed-in accounts — pass `login_hint`.** With several Google
  accounts signed in, a silent refresh with no account hint errors (Google can't choose without UI), so a
  *signed-in* user gets a needless prompt. Fix: remember the account **email** (the `email` claim — non-secret,
  not a credential) and pass it as `login_hint` on the silent mint (OIDC Core §3.1.2.1). Persist only the
  email to `storage.local`; the **ID token stays in `storage.session`** (in-memory) — never write a bearer
  credential to disk (extension storage is unencrypted), and don't adopt a refresh-token flow to "fix"
  restarts (that puts a *longer-lived* credential at rest — worse). Worked example: `extension/src/auth.mjs`
  (`cacheToken` remembers the email; `loadLoginHint`/`buildAuthUrl` thread it through).

- **Escalate to interactive auth only from a real user gesture, and only as a last resort.** Reads send no
  token, so the panel-open/read path can't prompt. The write path must too: the first POST uses a
  silent-only token, and a *visible* Google prompt is permitted **only** on the 401 retry — which already
  runs inside the Post click. Encode it as a hard rule: `getIdToken` escalates to interactive **iff**
  `interactive && forceRefresh` (both default false), so no other caller can surface UI by accident. Worked
  example: `extension/src/auth.mjs` (`getIdToken` escalation guard) + `extension/src/api.mjs` (`postComment`
  silent-first, interactive-on-401). Unit-tested by stubbing `chrome.*` in `extension-test/auth.test.mjs`.

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
  Worked example: `extension/src/hover-registration.mjs` (register/unregister/reconcile) +
  `extension/src/options.mjs` (the toggle click handler calling `chrome.permissions.request` directly) +
  `extension/manifest.json` (`optional_host_permissions`, `scripting`, no static `content_scripts`).

- **A registered/declarative content script is a CLASSIC script — it can't be an ES module, so top-level
  `import`s throw *in the host page*, silently.** `chrome.scripting.registerContentScripts` (and static
  `content_scripts`) inject their `js` files as classic scripts; there is no module mode
  (`RegisteredContentScript` has no `type: 'module'`, unlike a page's `<script type="module">`). Point one
  at a file that starts with `import { … } from './x.mjs'` and Chrome throws `Uncaught SyntaxError: Cannot
  use import statement outside a module` — but in the **third-party page's** console, not the extension's
  service-worker/side-panel devtools, so the feature looks like a total no-op with a clean extension
  console. This bit the link-hover preview: `link-hover.mjs` was modeled on `sidepanel.mjs` (which is fine
  as a module — `sidepanel.html` loads it via `<script type="module">`) and registered directly, so the
  toggle worked, the permission was granted, and nothing ever rendered. Fix WITHOUT a bundler (this repo
  ships raw modules): register a tiny **classic loader** whose only statement is a *dynamic*
  `import(chrome.runtime.getURL('src/link-hover.mjs'))` — dynamic `import()` is legal in a classic script,
  and the module it pulls in runs in the same content-script isolated world with the content-script
  `chrome.*` surface (storage, `runtime.sendMessage`) intact. The dynamically-imported module **and its
  whole transitive import graph** must be listed in `web_accessible_resources` (gated to the feature's
  origins) or the fetch is blocked; a unit test walks that graph from the entry module so a newly-added
  import can't silently fall out of the list. Worked example: `extension/src/link-hover-loader.mjs` (the
  injected classic loader) + `extension/manifest.json` (`web_accessible_resources`) +
  `extension-test/manifest.test.mjs` (the graph-coverage + classic-loader guards). NB the jsdom harness
  (`dev/requirements/shared/render/link-hover-harness.mjs`) `import()`s `link-hover.mjs` directly, so it
  proves the module's *logic* but never Chrome's classic-injection contract — exactly the seam this bug
  lived in (the `11.14` real-Chrome e2e is the tracked gap).
