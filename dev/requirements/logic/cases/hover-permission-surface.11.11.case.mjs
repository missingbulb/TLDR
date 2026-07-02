// 11.11 — The shipped manifest requests the link-hover host access ONLY as optional_host_permissions
// (http://*/*, https://*/*) alongside the "scripting" permission — never a static host_permissions or
// content_scripts entry, so granting hover-preview access never shows an install-time warning; it's
// only ever requested from the options-page toggle's chrome.permissions.request() (11.10). Asserted
// against the shipped manifest, the same style as the other manifest-surface leaves (7.1/7.2).
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "the link-hover host access is requested only as an optional permission, never statically",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const fs = await import("node:fs");
    const manifest = JSON.parse(fs.readFileSync(path.join(CLIENT, "manifest.json"), "utf8"));

    assert.ok(manifest.permissions.includes("scripting"), "scripting is required for the dynamic registration");
    assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
    assert.ok(!("host_permissions" in manifest), "no ALWAYS-granted host access");
    assert.ok(!("content_scripts" in manifest), "the link-hover script is registered dynamically, never statically");
  },
};
