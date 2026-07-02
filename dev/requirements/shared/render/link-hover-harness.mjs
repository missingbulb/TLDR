// The harness that drives the REAL link-hover.mjs content script (issue #26) under jsdom — the
// content-script analogue of harness.mjs (which drives the extension's OWN pages: sidepanel/options/
// menu). This one is deliberately separate rather than folded into harness.mjs's SURFACES map: a
// content script has no HTML shell of its own — it's injected into an ARBITRARY third-party page — so
// this harness builds a minimal synthetic host-page fixture instead of loading one of client/src/*.html.
//
// Same discipline as harness.mjs: the REAL, unmodified client/src/link-hover.mjs runs; only its inputs
// (document, chrome, timers) are faked. Timers are CAPTURED (not run), so a case advances the hover
// debounce explicitly via flushTimers() instead of racing a real clock — same reasoning as harness.mjs's
// options "Saved." auto-clear handling.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { makeFakeChrome } from "./fake-chrome.mjs";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "client");
const MODULE_PATH = path.join(CLIENT, "src", "link-hover.mjs");
let loadCounter = 0;

// A minimal third-party host page: one link per entry in `links` (id -> href), so a case can hover a
// specific one by id. Deliberately bare — link-hover.mjs only cares about <a href> elements.
function hostPageHtml(links) {
  const anchors = Object.entries(links)
    .map(([id, href]) => `<a id="${id}" href="${href}">${id}</a>`)
    .join("\n");
  return `<!doctype html><html><body>${anchors}</body></html>`;
}

/**
 * Open a fresh link-hover session over a synthetic host page.
 * @param {object} testCase
 * @param {Record<string,string>} testCase.links   id -> href, rendered as <a id> fixtures.
 * @param {string[]|null} testCase.denylist         the synced user denylist (like harness.mjs's sidepanel).
 * @param {string|null} testCase.currentCategory     seeds chrome.storage.local's currentCategory.
 * @param {(message: object) => object} testCase.onMessage  fakes the SW's answer to chrome.runtime.sendMessage.
 * @returns {Promise<Session>}
 */
export async function open(testCase) {
  const dom = new JSDOM(hostPageHtml(testCase.links ?? {}), { url: "https://host-page.example/article" });
  const doc = dom.window.document;

  const { chrome, calls } = makeFakeChrome({
    tabUrl: "https://host-page.example/article", // unused by link-hover.mjs, kept for fake-chrome's shape
    denylist: testCase.denylist ?? null,
    localSeed: testCase.currentCategory ? { currentCategory: testCase.currentCategory } : null,
    onMessage: testCase.onMessage ?? null,
  });

  const saved = {
    document: global.document,
    window: global.window,
    chrome: global.chrome,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  };
  const timers = new Map();
  let timerSeq = 0;

  global.document = doc;
  global.window = dom.window;
  global.chrome = chrome;
  // Every timer link-hover.mjs sets is its hover debounce — capture all of them (unlike harness.mjs,
  // which passes through 0-delay timers; link-hover.mjs has none) so a case controls it explicitly.
  global.setTimeout = (fn, delay, ...args) => {
    const id = ++timerSeq;
    timers.set(id, () => fn(...args));
    return id;
  };
  global.clearTimeout = (id) => {
    timers.delete(id);
  };

  await import(pathToFileURL(MODULE_PATH).href + `?h=${++loadCounter}`);

  const settle = async () => {
    for (let i = 0; i < 12; i++) await new Promise((r) => saved.setTimeout(r, 0));
  };

  const session = {
    document: doc,
    chrome,
    calls,
    // Dispatch a real mouseover/mouseout on the fixture <a id>, bubbling (link-hover.mjs delegates on
    // `document` and reads event.target.closest('a[href]')).
    hover(id) {
      doc.getElementById(id).dispatchEvent(new dom.window.Event("mouseover", { bubbles: true }));
    },
    unhover(id) {
      doc.getElementById(id).dispatchEvent(new dom.window.Event("mouseout", { bubbles: true }));
    },
    // Run every pending debounce timer (not superseded by a clearTimeout) — the hover debounce fires.
    async flushTimers() {
      const pending = [...timers.values()];
      timers.clear();
      for (const t of pending) t();
      await settle();
    },
    settle,
    // The mounted tooltip's shadow-root content, or null if none is mounted — reads straight off the
    // shadow root link-hover.mjs attaches, exactly what a real page's inspector would show.
    tooltipText() {
      const host = doc.body.querySelector("div"); // link-hover.mjs's only body-level insertion
      const root = host?.shadowRoot;
      const el = root?.querySelector(".tldr-hover-tooltip");
      return el ? el.textContent : null;
    },
    tooltipMounted() {
      return doc.body.querySelector("div")?.shadowRoot?.querySelector(".tldr-hover-tooltip") != null;
    },
    // The tooltip's text parts, read separately (label/body/meta are sibling elements, and meta itself
    // splits into author + votes, so a bare textContent would run them together). Null when unmounted.
    tooltipParts() {
      const el = doc.body.querySelector("div")?.shadowRoot?.querySelector(".tldr-hover-tooltip");
      if (!el) return null;
      return {
        label: el.querySelector(".label")?.textContent ?? "",
        body: el.querySelector(".body")?.textContent ?? "",
        author: el.querySelector(".meta .author")?.textContent ?? "",
        votes: el.querySelector(".meta .votes")?.textContent ?? "",
      };
    },
    close() {
      global.document = saved.document;
      global.window = saved.window;
      global.chrome = saved.chrome;
      global.setTimeout = saved.setTimeout;
      global.clearTimeout = saved.clearTimeout;
      dom.window.close();
    },
  };
  return session;
}

// Open a link-hover session, drive the hover through to a MOUNTED tooltip, and materialize the
// shadow-root tooltip element into `document.body` — jsdom shadow roots are invisible to
// `body.querySelectorAll`, so the shared CSS-folding + crop pipeline (image-renderer.mjs) couldn't see
// it otherwise. This is the session opener behind the `component` snapshot leaf pinning the popup's
// look: the SAME real link-hover.mjs run as the behavior cases, just frozen at the shown-popup state.
export async function openForTooltipSnapshot(testCase) {
  const session = await open(testCase);
  const [firstId] = Object.keys(testCase.links ?? {});
  session.hover(testCase.hoverId ?? firstId);
  await session.flushTimers();
  const host = session.document.body.querySelector("div");
  const tooltip = host?.shadowRoot?.querySelector(".tldr-hover-tooltip");
  if (!tooltip) {
    session.close();
    throw new Error("link-hover snapshot: no tooltip mounted after the hover — check the case's onMessage/links");
  }
  // Drop positionTooltip's inline left/top (they place the popup over the host page's link — in a
  // standalone crop they're meaningless), then adopt the tooltip as the body's only child.
  tooltip.removeAttribute("style");
  session.document.body.replaceChildren(tooltip);
  return session;
}
