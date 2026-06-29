// 1.1 — On a non-commentable page the panel is off: the off status, an empty page line, no composer.
"use strict";

export default {
  description: "a denylisted page shows the off status and hides the composer",
  tabUrl: "https://google.com/search?q=hello",
  denylist: ["google.com"],
};
