// 10.14 — The toolbar icon's RIGHT-CLICK menu switches category (issue #25): on install the SW builds
// one action context-menu item per category (from the shared list), and picking one records it as the
// current category (chrome.storage.local — the key the panel reads/watches) and opens/switches the pane
// to it. Drives the REAL service-worker.mjs against a fake chrome, capturing the contextMenus.create
// calls, the storage.local write, and the sidePanel.open. (The left-click open/close is 10.11.)
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "extension");

export default {
  description: "right-clicking the toolbar icon lists the categories; picking one records it and opens the pane",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { CATEGORIES } = await import(pathToFileURL(path.join(CLIENT, "vendor", "categories.GENERATED.mjs")).href);

    const created = [];
    const sidePanelOpens = [];
    const localStore = {};
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
      action: { onClicked: listener("clicked"), setPopup: async () => {} },
      contextMenus: {
        onClicked: listener("contextClicked"),
        removeAll: async () => { created.length = 0; },
        create: (item) => created.push(item),
      },
      sidePanel: { open: async ({ tabId }) => sidePanelOpens.push(tabId) },
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
        local: {
          get: async (key) => (key in localStore ? { [key]: localStore[key] } : {}),
          set: async (obj) => Object.assign(localStore, obj),
        },
        onChanged: { addListener: () => {} },
      },
      tabs: { onRemoved: listener("tabRemoved"), query: async () => [{ id: 1, active: true }] },
      webNavigation: { onBeforeNavigate: listener("beforeNavigate"), onCommitted: listener("committed") },
      permissions: { contains: async () => false },
      scripting: {
        getRegisteredContentScripts: async () => [],
        registerContentScripts: async () => {},
        unregisterContentScripts: async () => {},
      },
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));

    const savedChrome = global.chrome;
    global.chrome = fakeChrome;
    try {
      await import(pathToFileURL(path.join(CLIENT, "src", "service-worker.mjs")).href + "?swctxmenu");

      // On install the SW builds one 'action'-context item per category, from the shared list.
      await reg.installed();
      await tick();
      assert.deepEqual(
        created.map((m) => m.id),
        CATEGORIES.map((c) => `tldr-category:${c.id}`),
        "one context-menu item per category, keyed by category id",
      );
      assert.deepEqual(
        created.map((m) => m.title),
        CATEGORIES.map((c) => c.label),
        "each item is titled with the category's label",
      );
      for (const item of created) assert.deepEqual(item.contexts, ["action"], "the items live on the toolbar icon");

      // Picking Spoiler records it as the current category and opens/switches the pane to the clicked tab.
      await reg.contextClicked({ menuItemId: "tldr-category:spoiler" }, { id: 5 });
      await tick();
      assert.equal(localStore.currentCategory, "spoiler", "the picked category becomes the current category");
      assert.deepEqual(sidePanelOpens, [5], "picking a category opens/switches the pane");
    } finally {
      global.chrome = savedChrome;
    }
  },
};
