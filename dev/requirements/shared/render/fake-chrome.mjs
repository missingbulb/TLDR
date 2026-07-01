// A minimal FAKE of the `chrome.*` extension APIs the side panel and options page call. It lets a
// test load the REAL sidepanel.mjs / options.mjs UNMODIFIED — running the same render, refresh,
// post, and save code the extension runs — by standing in for the one boundary that is genuinely
// Chrome's job: the active tab's URL, the synced denylist, the session token cache, the remembered
// login_hint email (storage.local), and the OAuth redirect.
//
// The fake is deliberately faithful where the UI's behavior depends on it (it mints a *real,
// decodable* id_token whose nonce/state echo the request, so the production auth flow's checks
// pass), and a no-op where the UI only needs registration to succeed (the tab/storage change
// listeners). It runs offline, so it validates our model of Chrome, not Chrome itself — only a real
// browser e2e (a tracked follow-up) does that.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NOOP_EVENT = { addListener() {} };

// The REAL shipped manifest, so chrome.runtime.getManifest() returns the same object the extension
// sees — including the `version` the side panel attaches as X-Client-Version on every API request.
// Read from source (not hard-coded) so it tracks a version bump automatically.
const MANIFEST = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client", "manifest.json"),
    "utf8",
  ),
);

// Build a JWT-shaped id_token whose payload carries the request's `nonce` and a far-future `exp`,
// base64url-encoded the way a real Google token is. The production auth.mjs decodes the payload,
// checks the nonce matches what it sent, and checks it isn't expired — all of which pass here — but
// never verifies the RS256 signature (the server does that), so a placeholder signature is fine.
function mintIdToken(nonce, nowMs) {
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = b64url({ alg: "RS256", typ: "JWT" });
  const payload = b64url({
    nonce,
    exp: Math.floor(nowMs / 1000) + 3600,
    email: "you@example.com",
    sub: "user-123",
    name: "You",
  });
  return `${header}.${payload}.sig`;
}

/**
 * @param {object} opts
 * @param {string} opts.tabUrl        the active tab's URL the panel reads.
 * @param {string[]|null} opts.denylist  the synced user denylist (null → key absent, panel uses its default).
 * @param {boolean} opts.authFails    make the interactive OAuth flow reject (to exercise the post-failure UI).
 * @param {number} opts.nowMs         the pinned "now" (so the minted token's exp is deterministic).
 * @param {object|null} opts.localSeed  initial chrome.storage.local contents (e.g. `{ myVotes: [...] }`
 *   to render the voted-by-me state — the viewer's own votes the public read can't carry).
 * @returns a `chrome` object plus `calls`, capturing what the UI asked the browser to do.
 */
export function makeFakeChrome({ tabUrl, denylist = null, authFails = false, nowMs = Date.now(), localSeed = null }) {
  // In-memory stores per area, seeded from the case (the synced denylist; the local login_hint email /
  // own-vote set / current category). set() emits chrome.storage.onChanged like the real API, so a case
  // can drive a live reaction (e.g. the toolbar menu switching the current category, issue #25).
  const stores = {
    sync: denylist != null ? { userDenylist: denylist } : {},
    session: {}, // token cache
    local: { ...(localSeed ?? {}) },
  };
  const changeListeners = [];
  const calls = { syncSet: [], launchWebAuthFlow: 0, sidePanelOpen: 0 };

  function areaApi(name) {
    const store = stores[name];
    return {
      get: async (key) => {
        if (key == null) return { ...store };
        const keys = Array.isArray(key) ? key : typeof key === "object" ? Object.keys(key) : [key];
        const out = {};
        for (const k of keys) if (k in store) out[k] = store[k];
        return out;
      },
      set: async (obj) => {
        if (name === "sync") calls.syncSet.push(obj);
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: store[k], newValue: v };
          store[k] = v;
        }
        for (const fn of changeListeners) fn(changes, name);
      },
    };
  }

  const chrome = {
    tabs: {
      query: async () => [{ url: tabUrl, index: 0, active: true, id: 1, windowId: 1 }],
      onActivated: NOOP_EVENT,
      onUpdated: NOOP_EVENT,
    },
    webNavigation: { onHistoryStateUpdated: NOOP_EVENT },
    storage: {
      sync: areaApi("sync"),
      session: areaApi("session"),
      local: areaApi("local"),
      onChanged: { addListener: (fn) => changeListeners.push(fn) },
    },
    identity: {
      getRedirectURL: () => "https://extension-id.chromiumapp.org/",
      launchWebAuthFlow: async ({ url }) => {
        calls.launchWebAuthFlow += 1;
        if (authFails) throw new Error("auth cancelled");
        const params = new URL(url).searchParams;
        const nonce = params.get("nonce");
        const state = params.get("state");
        return `https://extension-id.chromiumapp.org/#id_token=${mintIdToken(nonce, nowMs)}&state=${state}`;
      },
    },
    // The category menu opens the side panel (issue #25); capture the call. setPanelBehavior remains a
    // no-op the SW may still call.
    sidePanel: { setPanelBehavior: async () => {}, open: async () => { calls.sidePanelOpen += 1; } },
    runtime: {
      onInstalled: NOOP_EVENT,
      onStartup: NOOP_EVENT,
      getManifest: () => MANIFEST,
      // The side panel opens a Port to the SW so the toolbar toggle can close it (issue #25). A no-op
      // port here — the pane/SW handshake itself is chrome glue covered by the real-browser e2e (§8.1).
      connect: () => ({ onMessage: NOOP_EVENT, onDisconnect: NOOP_EVENT, postMessage() {}, disconnect() {} }),
    },
  };

  return { chrome, calls };
}
