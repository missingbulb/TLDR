// 10.11 — The toolbar icon TOGGLES the pane (issue #25, owner behaviour): pane CLOSED → the icon's
// popup is the category menu (pick a category → open); pane OPEN → the icon closes the pane. Drives the
// REAL service-worker.mjs against a fake chrome, capturing the action-popup swaps + the close message:
// no pane → menu popup; a pane's Port connect → popup cleared (so a click toggles closed); a click →
// asks the pane to close; the Port disconnect → menu popup restored; and a click with no pane self-heals
// back to the menu. (The open/close round-trip in a real browser is the e2e follow-up, §8.1.)
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");
const MENU = "src/category-menu.html";

export default {
  description: "the toolbar icon shows the category menu when the pane is closed and closes the pane when it's open",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;

    // Capture the listeners the SW registers at import, and every action.setPopup value.
    const setPopupCalls = [];
    const reg = {};
    const listener = (key) => ({ addListener: (fn) => { reg[key] = fn; } });
    const fakeChrome = {
      runtime: { onConnect: listener("connect"), onInstalled: listener("installed"), onStartup: listener("startup") },
      action: { onClicked: listener("clicked"), setPopup: async ({ popup }) => setPopupCalls.push(popup) },
      storage: { sync: { get: async () => ({}), set: async () => {} } },
    };
    const last = () => setPopupCalls[setPopupCalls.length - 1];
    const tick = () => new Promise((r) => setTimeout(r, 0));

    const savedChrome = global.chrome;
    global.chrome = fakeChrome;
    try {
      await import(pathToFileURL(path.join(CLIENT, "src", "service-worker.mjs")).href + "?swtoggle");

      // Pane CLOSED (default): the icon's popup is the category menu.
      await reg.installed();
      await tick();
      assert.equal(last(), MENU, "with no pane open, the icon opens the category menu");

      // Pane OPENS (the panel announces its Port): clear the popup so a click toggles the pane closed.
      const messages = [];
      const port = { name: "panel", postMessage: (m) => messages.push(m), onDisconnect: listener("disconnect") };
      reg.connect(port);
      await tick();
      assert.equal(last(), "", "while a pane is open, the icon's popup is cleared (a click toggles it closed)");

      // A click while open asks the pane to close itself (there is no close API).
      await reg.clicked();
      await tick();
      assert.deepEqual(messages, [{ type: "close" }], "clicking the icon with a pane open asks it to close");

      // Pane CLOSES (its Port disconnects): the category-menu popup is restored.
      reg.disconnect();
      await tick();
      assert.equal(last(), MENU, "once the pane closes, the icon opens the category menu again");

      // Desync self-heal: a click with no live port restores the menu instead of a stuck no-op.
      const before = setPopupCalls.length;
      await reg.clicked();
      await tick();
      assert.equal(last(), MENU, "a click with no open pane restores the menu popup (self-heal)");
      assert.ok(setPopupCalls.length > before, "the self-heal re-asserted the popup");
    } finally {
      global.chrome = savedChrome;
    }
  },
};
