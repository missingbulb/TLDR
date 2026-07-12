// Classic content-script shim for the link-hover preview (issue #26). This — NOT link-hover.mjs — is
// what hover-registration.mjs registers via chrome.scripting.registerContentScripts.
//
// WHY: a content script is injected as a CLASSIC script; MV3 gives no way to register one as an ES
// module. So link-hover.mjs's top-level `import { … } from './denylist.mjs'` throws the console error
// "Uncaught SyntaxError: Cannot use import statement outside a module" the instant it's injected, and
// the whole hover feature is dead on every page. A classic script may still use DYNAMIC import(), which
// loads its target AS a module — so this one-liner pulls in the real module (and, transitively, its
// deps). Every file in that graph is declared in manifest web_accessible_resources so the extension
// origin will actually serve it to the injected context (a manifest test walks the graph to guard it).
//
// chrome.runtime.getURL resolves to chrome-extension://<id>/src/link-hover.mjs; the module's own
// relative imports then resolve against that same extension origin, so all of them are extension URLs.
import(chrome.runtime.getURL('src/link-hover.mjs')).catch((err) => {
  console.error('[tldr link-hover] failed to load the hover module', err);
});
