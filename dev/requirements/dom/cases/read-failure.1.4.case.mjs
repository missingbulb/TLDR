// 1.4 — When the notes read fails and there's nothing cached to show, the panel states it plainly
// ("Couldn't load notes.") rather than looking empty.
"use strict";

export default {
  description: "a failed read with no notes shows the load-error status",
  tabUrl: "https://example.com/article",
  readFails: true,
};
