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

// --- link-hover preview walk lines (issue #26) ---------------------------------------------------
// Each drives the REAL link-hover.mjs / options.mjs through the same harness (and the same scenario
// object) its leaf's verify() gates, and renders the walk as one line of markdown text — the doc shows
// the actual outbound lookup and the actual popup content, not a "trust the runner" pointer.

import { open as openLinkHover } from "../shared/render/link-hover-harness.mjs";

// `hover → debounce → \`getTopComment(tldr)\` → popup “TLDR · <body> · <author> · ▲ <votes>”; mouseout → removed`
export async function hoverShowsPopupLine({ baseCase, id = "link1" }) {
  const s = await openLinkHover(baseCase);
  try {
    s.hover(id);
    await s.flushTimers();
    const msg = s.calls.sendMessage[0];
    const p = s.tooltipParts();
    const popup = p ? `popup “${p.label} · ${p.body} · ${p.author} · ${p.votes}”` : "no popup (!)";
    s.unhover(id);
    const after = s.tooltipMounted() ? "still shown (!)" : "removed";
    return `hover → debounce → \`getTopComment(${msg.category})\` → ${popup}; mouseout → ${after}`;
  } finally {
    s.close();
  }
}

// Two hovers, one line: an empty category (the lookup runs, nothing shows) and a denylisted host
// (no lookup at all). The two scenario objects are the same ones the leaf's verify() drives.
export async function hoverShowsNothingLine({ emptyCase, emptyId, denylistedCase, denylistedId }) {
  const segments = [];
  let s = await openLinkHover(emptyCase);
  try {
    s.hover(emptyId);
    await s.flushTimers();
    const msg = s.calls.sendMessage[0];
    segments.push(
      `hover → \`getTopComment(${msg.category})\` → \`{ comment: null }\` → ${s.tooltipMounted() ? "popup (!)" : "nothing shown"}`
    );
  } finally {
    s.close();
  }
  s = await openLinkHover(denylistedCase);
  try {
    s.hover(denylistedId);
    await s.flushTimers();
    const looks = s.calls.sendMessage.length;
    segments.push(`hover a denylisted host → ${looks === 0 ? "no lookup at all" : `${looks} lookups (!)`}, nothing shown`);
  } finally {
    s.close();
  }
  return segments.join("; ");
}

// `hover → \`getTopComment(tldr)\`; switch current category → spoiler; hover again → \`getTopComment(spoiler)\``
export async function hoverCategorySwitchLine({ baseCase, id = "link1", switchTo }) {
  const s = await openLinkHover(baseCase);
  try {
    s.hover(id);
    await s.flushTimers();
    s.unhover(id);
    await s.chrome.storage.local.set({ currentCategory: switchTo });
    s.hover(id);
    await s.flushTimers();
    const [first, second] = s.calls.sendMessage.map((m) => m.category);
    return `hover → \`getTopComment(${first})\`; switch current category → ${switchTo}; hover again → \`getTopComment(${second})\``;
  } finally {
    s.close();
  }
}

// `check → \`permissions.request(http://*/*, https://*/*)\` granted → register \`link-hover\`; uncheck → unregister + \`permissions.remove\``
export async function hoverToggleWalkLine() {
  const s = await open("options", { permissionGranted: true });
  try {
    const toggle = s.document.getElementById("hover-preview-toggle");
    toggle.click();
    await s.settle();
    const req = s.calls.permissionsRequest[0];
    const reg = s.registeredScripts[0];
    const steps = [`check → \`permissions.request(${req.origins.join(", ")})\` granted → register \`${reg.id}\``];
    toggle.click();
    await s.settle();
    const removed = s.calls.permissionsRemove.length > 0;
    steps.push(`uncheck → unregister (${s.registeredScripts.length} left) + ${removed ? "`permissions.remove`" : "no revoke (!)"}`);
    return steps.join("; ");
  } finally {
    s.close();
  }
}
