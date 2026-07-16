# Chrome extension (MV3) — lessons

Notes for the TLDR extension under `extension/`. These are largely portable; the distilled, project-stripped
versions are what would propagate to the corpus `technologies/chrome-extension.md`.

- **Escalate to interactive auth only from a real user gesture, and only as a last resort.** Reads send no
  token, so the panel-open/read path can't prompt. The write path must too: the first POST uses a
  silent-only token, and a *visible* Google prompt is permitted **only** on the 401 retry — which already
  runs inside the Post click. Encode it as a hard rule: `getIdToken` escalates to interactive **iff**
  `interactive && forceRefresh` (both default false), so no other caller can surface UI by accident. Worked
  example: `extension/src/auth.mjs` (`getIdToken` escalation guard) + `extension/src/api.mjs` (`postComment`
  silent-first, interactive-on-401). Unit-tested by stubbing `chrome.*` in `extension-test/auth.test.mjs`.

- **A toolbar action can't left-click-OPEN and left-click-CLOSE from one static manifest, and a popup
  suppresses `onClicked` entirely — so gate the popup, don't make it permanent.** MV3 has no
  is-open/close API and a `default_popup` swallows every click before `onClicked` fires. To make a plain
  click just open (pane closed) or close (pane open) the side panel — without a category picker popping
  up each time — track pane-open via the panel's `Port` and keep the popup **cleared** (`setPopup({popup:''})`)
  except on genuine first run: no category chosen yet AND no pane open. The first-run popup then gives way
  the instant a category lands in `storage.local`, reconciled from a `storage.onChanged` listener (not
  just the panel's Port connect), so it clears whether the category was picked from the popup or the
  right-click menu. Move the "which category" choice to the icon's **right-click** menu:
  `chrome.contextMenus.create({contexts:['action'], …})` puts items on the toolbar icon itself, and
  `contextMenus` carries **no** install-time warning. Recreate the items with `removeAll()` first on
  install/startup so they self-heal instead of throwing on duplicate ids. Worked example:
  `extension/src/service-worker.mjs` (`reflectPopup`/`hasChosenCategory`, the `onClicked` open-or-close,
  `setupCategoryContextMenu` + its `onClicked`, and the `storage.onChanged` first-run reconcile).

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
