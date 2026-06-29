// The harness that drives the REAL extension UI under jsdom. It loads the unmodified
// sidepanel.mjs / options.mjs into a jsdom document seeded from the real shipped HTML, installs the
// fake `chrome.*` + a fake `fetch`, PINS `Date.now()` to the reference instant, and returns a live
// "session": the rendered document plus helpers to type, submit, settle, and inspect what the UI
// asked the browser/network to do. Both kinds build on it — the `dom` kind rasterizes the session's
// document to a PNG (image-renderer.mjs); the `behavior` kind drives a gesture and asserts the DOM +
// captured calls.
//
// The key property (see .claudinite/tasks/testingPractices.md): the snapshot/behavior is driven
// through the REAL code path, faking only its inputs. There is no parallel re-implementation of the
// render — change sidepanel.mjs and the images move with it.
//
// Determinism: every global the harness swaps (document, window, chrome, fetch, console.warn,
// Date.now, setTimeout/clearTimeout) is restored in close(); app timers (the options "Saved."
// auto-clear, the panel's refresh debounce) are CAPTURED rather than run, so a test advances them
// explicitly with flushTimers() instead of waiting on a real clock.
//
// Failure honesty: the harness does NOT swallow errors. It leaves `console.error` and the default
// unhandled-rejection behavior alone, so a real failure in the app's fire-and-forget async (e.g.
// sidepanel.mjs's top-level init(), options.mjs's load()) surfaces and fails the test rather than
// being captured into an array nobody reads. Only `console.warn` is captured — the panel logs a
// deliberately-exercised read/post failure via console.warn, and capturing it keeps the test output
// clean while a case can still inspect session.warnings.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { makeFakeChrome } from "./fake-chrome.mjs";
import { REFERENCE_NOW_MS } from "../reference-time.mjs";

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
let loadCounter = 0; // makes each module load a fresh evaluation (its own module-level state)

const SURFACES = {
  sidepanel: { html: "src/sidepanel.html", mod: "src/sidepanel.mjs", form: "composer", input: "body" },
  options: { html: "src/options.html", mod: "src/options.mjs", form: "form", input: "denylist" },
};

// Build the fake `fetch` the UI's read/post path hits. Returns the configured comments for a GET,
// and records every POST so a behavior case can assert the write carried a bearer token (and the
// read did not). `readFails`/`postFails` exercise the error UIs; `postHangs` freezes a post mid-flight
// so the optimistic "posting…" state can be snapshotted without it resolving.
function makeFakeFetch(testCase, fetchLog) {
  return async (url, options = {}) => {
    const method = options.method || "GET";
    fetchLog.push({ url: String(url), method, headers: options.headers || {}, body: options.body });
    if (method === "GET") {
      if (testCase.readFails) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ comments: testCase.comments ?? [] }) };
    }
    // POST (write)
    if (testCase.postHangs) return new Promise(() => {});
    if (testCase.postFails) return { ok: false, status: 500, json: async () => ({}) };
    const sent = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        comment: { commentId: "server-1", body: sent.body, authorName: "You", authorId: "user-123", createdAt: REFERENCE_NOW_MS },
      }),
    };
  };
}

/**
 * Open a UI surface and run its real module against the case's faked inputs.
 * @param {"sidepanel"|"options"} surface
 * @param {object} testCase  tabUrl / denylist / comments / readFails / postFails / postHangs / authFails / stored
 * @returns {Promise<Session>} a live session — CALL session.close() in a finally.
 */
export async function open(surface, testCase) {
  const spec = SURFACES[surface];
  const html = fs.readFileSync(path.join(CLIENT, spec.html), "utf8");
  const url = testCase.tabUrl || "https://example.com/article";
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  // The shell's inert <script type="module"> never runs under jsdom; strip it so it isn't a stray node.
  for (const s of doc.querySelectorAll("script")) s.remove();

  const { chrome, calls } = makeFakeChrome({
    tabUrl: url,
    denylist: surface === "sidepanel" ? testCase.denylist ?? null : testCase.stored ?? null,
    authFails: Boolean(testCase.authFails),
    nowMs: REFERENCE_NOW_MS,
  });
  const fetchLog = [];
  const warnings = [];

  // ---- install the environment -------------------------------------------------------------
  const saved = {
    document: global.document,
    window: global.window,
    chrome: global.chrome,
    fetch: global.fetch,
    warn: console.warn,
    now: Date.now,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  };
  // Captured app timers (delay > 0), keyed by a real, cancellable id so the app's debounce
  // (clearTimeout(id); setTimeout(...)) supersedes correctly instead of leaking a stale callback.
  const timers = new Map();
  let timerSeq = 0;

  global.document = doc;
  global.window = dom.window;
  global.chrome = chrome;
  global.fetch = makeFakeFetch(testCase, fetchLog);
  // The production failure paths log via console.warn (e.g. "post failed") — capture rather than
  // print, so a deliberately-exercised error doesn't litter the test output, while still being
  // inspectable by a case that wants to assert it. console.error and unhandled rejections are left
  // ALONE so a real app-async failure fails the test loudly instead of being swallowed.
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  Date.now = () => REFERENCE_NOW_MS;
  // Pass through 0-delay timers (the harness's own settle) to the real clock; capture app timers
  // (delay > 0) so a test runs them deterministically with flushTimers().
  global.setTimeout = (fn, delay, ...args) => {
    if (delay && delay > 0) {
      const id = ++timerSeq;
      timers.set(id, () => fn(...args));
      return id;
    }
    return saved.setTimeout(fn, delay, ...args);
  };
  global.clearTimeout = (id) => {
    if (timers.has(id)) timers.delete(id);
    else saved.clearTimeout(id);
  };

  // Drain the finite microtask chain the module's init() schedules (storage.get → refresh →
  // getComments → render). No real I/O is involved (every fake resolves synchronously), so a few
  // macrotask turns guarantee completion — this is not racing a network, it's flushing a queue.
  const settle = async () => {
    for (let i = 0; i < 12; i++) await new Promise((r) => saved.setTimeout(r, 0));
  };

  // ---- run the real module -----------------------------------------------------------------
  await import(pathToFileURL(path.join(CLIENT, spec.mod)).href + `?h=${++loadCounter}`);
  await settle();

  const session = {
    surface,
    document: doc,
    window: dom.window,
    chrome,
    calls,
    fetchLog,
    warnings,
    settle,
    el: (id) => doc.getElementById(id),
    text: (id) => doc.getElementById(id)?.textContent ?? null,
    // Type into the surface's primary input (the composer textarea / the denylist textarea).
    type(value) {
      doc.getElementById(spec.input).value = value;
    },
    // Submit the surface's form, exactly as a click on its submit button would.
    submit() {
      doc.getElementById(spec.form).dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    },
    // Run the app timers still pending (not superseded by a clearTimeout), e.g. the options
    // "Saved." auto-clear.
    flushTimers() {
      const pending = [...timers.values()];
      timers.clear();
      for (const t of pending) t();
    },
    close() {
      global.document = saved.document;
      global.window = saved.window;
      global.chrome = saved.chrome;
      global.fetch = saved.fetch;
      console.warn = saved.warn;
      Date.now = saved.now;
      global.setTimeout = saved.setTimeout;
      global.clearTimeout = saved.clearTimeout;
      dom.window.close();
    },
  };
  return session;
}

// Convenience for the dom kind: open the right surface for a case, apply its optional `action`
// (a gesture that leaves the DOM in the state to snapshot), and return the session. The caller
// serializes session.document.body, then closes.
export async function openForSnapshot(testCase) {
  const surface = testCase.surface || "sidepanel";
  const session = await open(surface, testCase);
  if (testCase.action) await testCase.action(session);
  return session;
}
