// 6.1 — The options page renders the denylist editor: the heading, the helper text, a textarea
// seeded with the stored denylist (one host per line), and a Save button.
"use strict";

export default {
  surface: "options",
  description: "the options page renders the denylist editor seeded from storage",
  stored: ["google.com", "localhost", "example.org"],
};
