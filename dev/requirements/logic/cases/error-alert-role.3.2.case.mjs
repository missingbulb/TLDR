// 3.2 — The composer error is a role="alert" live region, so a post failure is announced to assistive
// tech the moment it's shown. Asserted against the shipped sidepanel.html.
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "the composer error is a role=\"alert\" live region",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const fs = await import("node:fs");
    const { JSDOM } = await import("jsdom");
    const html = fs.readFileSync(path.join(CLIENT, "src", "sidepanel.html"), "utf8");
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.getElementById("composer-error").getAttribute("role"), "alert");
  },
};
