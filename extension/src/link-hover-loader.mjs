// The CLASSIC-script entry point Chrome actually injects for the link-hover preview (issue #26). The
// feature's real logic lives in link-hover.mjs, an ES module that STATICALLY imports its pure helpers
// (denylist, gate, tooltip, category registry) — the same reuse-not-duplicate split the rest of
// extension/src follows. That split is fine for sidepanel.mjs, which sidepanel.html loads via
// `<script type="module">`. It is NOT fine for a content script: chrome.scripting.registerContentScripts
// injects its `js` files as CLASSIC scripts — there is no module mode for a registered content script
// (no `type: 'module'` on RegisteredContentScript). A top-level `import` in an injected file therefore
// throws "Cannot use import statement outside a module" in the HOST PAGE's console — invisible from the
// extension's own service-worker/side-panel devtools, so the options toggle looked like it did nothing.
//
// The one thing a classic script CAN still do is a DYNAMIC import(). A module pulled in this way runs in
// the same content-script isolated world and keeps the content-script chrome.* surface (storage,
// runtime.sendMessage) link-hover.mjs relies on — so link-hover.mjs itself, and this loader, stay
// import-graph-identical to before. link-hover.mjs and its whole transitive import graph are declared
// under manifest.json's `web_accessible_resources` (gated to the same http/https origins the feature is
// granted) so the page is allowed to fetch them via chrome.runtime.getURL. hover-registration.mjs
// registers THIS file as the content script, never link-hover.mjs directly.
import(chrome.runtime.getURL('src/link-hover.mjs')).catch((err) => {
  // Should never fire — the module graph is web-accessible — but surface it instead of an opaque
  // unhandled rejection if a resource is ever missing from web_accessible_resources.
  console.error('[TLDR] failed to load the link-hover preview module', err);
});
