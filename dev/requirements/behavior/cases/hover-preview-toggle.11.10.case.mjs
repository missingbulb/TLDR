// 11.10 — The options-page "Show hover previews on web pages" toggle (issue #26). Checking it must
// call chrome.permissions.request() with EXACTLY the hover-preview origins (from inside the click
// gesture — real Chrome refuses the call otherwise) and, on grant, register the content script and
// persist the enabled flag; declining the browser's own prompt leaves it unchecked and unregistered.
// Unchecking it unregisters the script AND revokes the permission again, so the extension's footprint
// shrinks back to zero the moment the user opts back out — this is the one place link-hover host access
// is ever requested (11.11 is the manifest counterpart: it's never granted by default).
"use strict";

const HOVER_ORIGINS = ["http://*/*", "https://*/*"];
const HOVER_ENABLED_KEY = "hoverPreviewEnabled";

export default {
  description: "the hover-preview toggle requests/revokes exactly the hover origins and (un)registers the content script",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");

    // --- checking it, and the browser grants the permission -------------------------------------
    let session = await open("options", { permissionGranted: true });
    try {
      const toggle = session.el("hover-preview-toggle");
      assert.equal(toggle.checked, false, "off by default");

      toggle.click();
      await session.settle();

      assert.deepEqual(session.calls.permissionsRequest, [{ origins: HOVER_ORIGINS }], "requests exactly the hover origins");
      assert.equal(session.registeredScripts.length, 1, "the content script is registered on grant");
      assert.equal(session.registeredScripts[0].id, "link-hover");
      assert.deepEqual(session.registeredScripts[0].matches, HOVER_ORIGINS);
      assert.deepEqual(
        session.calls.syncSet.find((s) => HOVER_ENABLED_KEY in s),
        { [HOVER_ENABLED_KEY]: true },
        "the enabled flag is persisted",
      );
      assert.equal(toggle.checked, true);
    } finally {
      session.close();
    }

    // --- checking it, but the browser's own prompt is declined -----------------------------------
    session = await open("options", { permissionGranted: false });
    try {
      const toggle = session.el("hover-preview-toggle");
      toggle.click();
      await session.settle();

      assert.equal(session.registeredScripts.length, 0, "a decline never registers the content script");
      assert.equal(toggle.checked, false, "the checkbox reverts when the browser prompt is declined");
      assert.ok(
        !session.calls.syncSet.some((s) => s[HOVER_ENABLED_KEY] === true),
        "a decline never persists the flag as enabled",
      );
    } finally {
      session.close();
    }

    // --- unchecking it revokes the permission and unregisters -------------------------------------
    session = await open("options", { permissionGranted: true });
    try {
      const toggle = session.el("hover-preview-toggle");
      toggle.click(); // on
      await session.settle();
      toggle.click(); // off
      await session.settle();

      assert.equal(session.registeredScripts.length, 0, "unregistered again");
      assert.deepEqual(session.calls.permissionsRemove, [{ origins: HOVER_ORIGINS }], "the granted permission is revoked");
      assert.deepEqual(
        session.calls.syncSet.filter((s) => HOVER_ENABLED_KEY in s).pop(),
        { [HOVER_ENABLED_KEY]: false },
        "the enabled flag is persisted back to false",
      );
    } finally {
      session.close();
    }
  },
};
