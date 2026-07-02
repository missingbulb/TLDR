// Single source of truth for the link-hover content script's DYNAMIC registration (issue #26). The
// script (src/link-hover.mjs) is NEVER declared statically in manifest.json — see manifest.json's
// "scripting" permission + "optional_host_permissions", and client/test/manifest.test.mjs — it exists
// only after the user opts in via the options-page toggle (options.mjs) and grants the optional host
// permission. Shared by options.mjs (the toggle handler) and service-worker.mjs (startup
// reconciliation, for when the permission was revoked outside the extension, e.g. via
// chrome://extensions directly, bypassing the toggle).
//
// chrome.permissions.request() itself is NOT here — it MUST run inside the click handler that
// triggered it (a live user gesture; Chrome refuses it otherwise), so options.mjs calls it directly and
// only calls into this module after a grant succeeds.

export const HOVER_ORIGINS = ['http://*/*', 'https://*/*'];
export const HOVER_ENABLED_KEY = 'hoverPreviewEnabled';
const CONTENT_SCRIPT_ID = 'link-hover';

// Idempotent: registerContentScripts throws on a duplicate id, so check first rather than try/catch —
// a second call (e.g. reconcileHoverRegistration running after the toggle already registered it) is a
// harmless no-op instead of a swallowed error.
export async function registerHoverContentScript() {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  if (existing.length) return;
  await chrome.scripting.registerContentScripts([
    { id: CONTENT_SCRIPT_ID, js: ['src/link-hover.mjs'], matches: HOVER_ORIGINS, runAt: 'document_idle' },
  ]);
}

// Idempotent: unregistering an id that isn't registered rejects, so the failure is swallowed —
// "already gone" is success here, exactly like the server's vote-toggle-off idempotence.
export async function unregisterHoverContentScript() {
  await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] }).catch(() => {});
}

// Startup self-heal: the persisted enabled flag (storage.sync — like the denylist, so it roams; but
// UNLIKE the denylist, the actual host-permission GRANT never syncs across devices/reinstalls, which
// this reconciliation exists to catch) and the actual granted permission can desync — most commonly a
// user revoking the host permission from chrome://extensions directly, or the flag having synced
// "enabled" onto a device that never granted it locally. Enabled + granted => make sure the
// registration exists (dynamic registrations persist across restarts, but this keeps the reconciliation
// self-contained rather than assuming that). Enabled + NOT granted => flip the flag off (self-heal the
// desync) and unregister. Not enabled => unregister unconditionally (covers a stale leftover
// registration from before an uninstall/reinstall).
export async function reconcileHoverRegistration() {
  const stored = await chrome.storage.sync.get(HOVER_ENABLED_KEY);
  const enabled = stored[HOVER_ENABLED_KEY] === true;
  const granted = await chrome.permissions.contains({ origins: HOVER_ORIGINS });

  if (enabled && granted) {
    await registerHoverContentScript();
    return;
  }
  if (enabled && !granted) await chrome.storage.sync.set({ [HOVER_ENABLED_KEY]: false });
  await unregisterHoverContentScript();
}
