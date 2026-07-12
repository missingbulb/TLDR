// 10.11 — The toolbar icon OPENS and CLOSES the pane on a plain click (issue #25, owner behaviour):
// pane CLOSED → the icon opens the pane (to the current category, no re-ask); pane OPEN → the icon
// closes it. The category-menu popup shows ONLY on first run — before any category has been chosen.
// Drives the REAL service-worker.mjs against a fake chrome, capturing the action-popup swaps, the
// sidePanel.open calls, and the close message: first run (no category) → menu popup; a category chosen
// → popup cleared (a click now opens directly); a click with no pane → the side panel opens; a Port
// connect → popup cleared; a click with a pane open → asks the pane to close. (The open/close
// round-trip in a real browser is the e2e follow-up, §8.1.)
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "extension");
const MENU = "src/category-menu.html";

export default {
  description: "the toolbar icon opens/closes the pane on a click, showing the category menu only on first run",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;

    // Capture the listeners the SW registers at import, every action.setPopup value, and each
    // sidePanel.open. A functional storage.local (emitting onChanged) drives the first-run reconcile.
    const setPopupCalls = [];
    const sidePanelOpens = [];
    const localStore = {};
    const changeListeners = [];
    const reg = {};
    const listener = (key) => ({ addListener: (fn) => { reg[key] = fn; } });
    const fakeChrome = {
      runtime: {
        onConnect: listener("connect"),
        onInstalled: listener("installed"),
        onStartup: listener("startup"),
        onMessage: listener("message"),
        getManifest: () => ({ version: "0.0.0-test" }),
      },
      action: { onClicked: listener("clicked"), setPopup: async ({ popup }) => setPopupCalls.push(popup) },
      // The right-click category switcher (10.14) is set up on install — inert plumbing for this case.
      contextMenus: { onClicked: listener("contextClicked"), removeAll: async () => {}, create: () => {} },
      sidePanel: { open: async ({ tabId }) => sidePanelOpens.push(tabId) },
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        // The redirect-provenance recorder (issue #58) reads/writes storage.session — inert here.
        session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
        // The current-category key: its presence flips the icon from first-run menu to plain open/close.
        local: {
          get: async (key) => (key in localStore ? { [key]: localStore[key] } : {}),
          set: async (obj) => {
            const changes = {};
            for (const [k, v] of Object.entries(obj)) {
              changes[k] = { oldValue: localStore[k], newValue: v };
              localStore[k] = v;
            }
            for (const fn of changeListeners) fn(changes, "local");
          },
        },
        onChanged: { addListener: (fn) => changeListeners.push(fn) },
      },
      tabs: { onRemoved: listener("tabRemoved"), query: async () => [{ id: 1, active: true }] },
      // The redirect-provenance recorder (issue #58) registers webNavigation/tab listeners at import;
      // this case never navigates, so registration succeeding is all it needs.
      webNavigation: { onBeforeNavigate: listener("beforeNavigate"), onCommitted: listener("committed") },
      // reconcileHoverRegistration (issue #26) runs on every onInstalled/onStartup — stub its
      // dependencies so this case, which never touches hover-preview, loads the real service-worker.mjs
      // cleanly (an "always-off, always-ungranted" environment).
      permissions: { contains: async () => false },
      scripting: {
        getRegisteredContentScripts: async () => [],
        registerContentScripts: async () => {},
        unregisterContentScripts: async () => {},
      },
    };
    const last = () => setPopupCalls[setPopupCalls.length - 1];
    const tick = () => new Promise((r) => setTimeout(r, 0));

    const savedChrome = global.chrome;
    global.chrome = fakeChrome;
    try {
      await import(pathToFileURL(path.join(CLIENT, "src", "service-worker.mjs")).href + "?swtoggle");

      // FIRST RUN (no category chosen, no pane): the icon opens the category menu.
      await reg.installed();
      await tick();
      assert.equal(last(), MENU, "on first run, with no category chosen, the icon opens the category menu");

      // A category gets chosen (the popup or the right-click menu would set this): the popup gives way.
      await fakeChrome.storage.local.set({ currentCategory: "tldr" });
      await tick();
      assert.equal(last(), "", "once a category is known, the popup is cleared so a click opens the pane directly");

      // A plain click with a category known and NO pane open → open the side panel (no re-ask).
      await reg.clicked({ id: 1 });
      await tick();
      assert.deepEqual(sidePanelOpens, [1], "clicking with the pane closed opens the side panel to the active tab");

      // Pane OPENS (the panel announces its Port): the popup stays cleared (a click will close it).
      const messages = [];
      const port = { name: "panel", postMessage: (m) => messages.push(m), onDisconnect: listener("disconnect") };
      reg.connect(port);
      await tick();
      assert.equal(last(), "", "while a pane is open, the icon's popup is cleared (a click closes it)");

      // A click while open asks the pane to close itself (there is no close API) and opens nothing new.
      await reg.clicked({ id: 1 });
      await tick();
      assert.deepEqual(messages, [{ type: "close" }], "clicking the icon with a pane open asks it to close");
      assert.deepEqual(sidePanelOpens, [1], "closing the pane does not also open a new one");
    } finally {
      global.chrome = savedChrome;
    }
  },
};
