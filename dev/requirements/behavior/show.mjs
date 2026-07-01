// One-line "shown result" builder for the vote-toggle behavior leaf — the two outbound calls the
// gesture emits and the count transition, as markdown TEXT, derived from the real run (the UI states
// themselves are shown by the component crops 9.1/9.2). Gated by the gallery refresh-then-compare.
// This shows the *server-call phase* of the requirement in the doc, rather than trusting the runner.
"use strict";

import { open } from "../shared/render/harness.mjs";

const VOTE_BTN = "li.comment .vote";
const routeOf = (url) => new URL(url).pathname.replace(/\/[^/]+\/vote$/, "/{id}/vote");

// `click ▲ → \`POST /comments/{id}/vote\` (count 3→4); click again → \`DELETE …\` (count 4→3)`
export async function voteToggleLine({ baseCase, clicks = 2 }) {
  const s = await open("sidepanel", baseCase);
  const count = () => s.document.querySelector("li.comment .vote-count").textContent;
  try {
    const steps = [];
    let prev = count();
    for (let i = 0; i < clicks; i++) {
      const before = s.fetchLog.length;
      s.document.querySelector(VOTE_BTN).click();
      await s.settle();
      const r = s.fetchLog.slice(before).find((c) => /\/vote$/.test(c.url));
      const now = count();
      const label = i === 0 ? "click ▲" : "click again";
      steps.push(`${label} → \`${r.method} ${routeOf(r.url)}\` (count ${prev}→${now})`);
      prev = now;
    }
    return steps.join("; ");
  } finally {
    s.close();
  }
}
