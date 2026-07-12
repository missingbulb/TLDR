// 11.11 — The shipped manifest requests the link-hover host access ONLY as optional_host_permissions
// (http://*/*, https://*/*) alongside the "scripting" permission — never a static host_permissions or
// content_scripts entry, so granting hover-preview access never shows an install-time warning; it's
// only ever requested from the options-page toggle's chrome.permissions.request() (11.10). Asserted
// against the shipped manifest, the same style as the other manifest-surface leaves (7.1/7.2).
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "extension");

async function readManifest() {
  const fs = await import("node:fs");
  return JSON.parse(fs.readFileSync(path.join(CLIENT, "manifest.json"), "utf8"));
}

export default {
  description: "the link-hover host access is requested only as an optional permission, never statically",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const manifest = await readManifest();

    assert.ok(manifest.permissions.includes("scripting"), "scripting is required for the dynamic registration");
    assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
    assert.ok(!("host_permissions" in manifest), "no ALWAYS-granted host access");
    assert.ok(!("content_scripts" in manifest), "the link-hover script is registered dynamically, never statically");
  },
  // The SHIPPED manifest's actual permission surface, shown in the doc — the values the assertion
  // reads, so what's shown can never depict a manifest the gate didn't check.
  show: async () => {
    const manifest = await readManifest();
    const has = (key) => (key in manifest ? `\`${JSON.stringify(manifest[key])}\`` : "absent ✓");
    return (
      `\`optional_host_permissions\`: \`${JSON.stringify(manifest.optional_host_permissions)}\` · ` +
      `\`scripting\` in permissions ${manifest.permissions.includes("scripting") ? "✓" : "MISSING"} · ` +
      `static \`host_permissions\`: ${has("host_permissions")} · static \`content_scripts\`: ${has("content_scripts")}`
    );
  },
};
