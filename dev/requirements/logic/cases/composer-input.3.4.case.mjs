// 3.4 — The composer's input affordances: the textarea caps input at maxlength 8192 and carries the
// placeholder prompt, and Post is a submit-type button (so Enter/click submit the form and the
// gesture is keyboard-reachable). Asserted against the shipped sidepanel.html.
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");

export default {
  description: "the composer textarea caps at maxlength 8192 with a placeholder, and Post is a submit button",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const fs = await import("node:fs");
    const { JSDOM } = await import("jsdom");
    const html = fs.readFileSync(path.join(CLIENT, "src", "sidepanel.html"), "utf8");
    const doc = new JSDOM(html).window.document;
    const body = doc.getElementById("body");
    assert.equal(body.getAttribute("maxlength"), "8192", "input is capped");
    assert.ok((body.getAttribute("placeholder") || "").trim().length > 0, "the textarea has a placeholder prompt");
    assert.equal(doc.getElementById("post").getAttribute("type"), "submit", "Post is a submit button");
  },
};
