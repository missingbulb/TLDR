// service-worker.mjs has no dedicated unit test elsewhere; it's otherwise only exercised indirectly via
// the toolbar-toggle behavior case (dev/requirements/behavior/cases/toolbar-toggle.10.11.case.mjs),
// which doesn't touch the onMessage handler this file adds. Same pattern as that case: hand-build a
// fake `chrome`, install it as the global, then dynamically import the REAL module (cache-busted so a
// second test gets a fresh module evaluation, since the top-level code registers listeners on import).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'src', 'service-worker.mjs');
let loadCounter = 0;

function stubChrome({ fetchImpl } = {}) {
  const reg = {};
  const listener = (key) => ({ addListener: (fn) => { reg[key] = fn; } });
  // In-memory chrome.storage.session, inspectable by the redirect-provenance tests below.
  const sessionStore = {};
  const chrome = {
    runtime: {
      onConnect: listener('connect'),
      onInstalled: listener('installed'),
      onStartup: listener('startup'),
      onMessage: listener('message'),
      getManifest: () => ({ version: '9.9.9-test' }),
    },
    action: { onClicked: listener('clicked'), setPopup: async () => {} },
    storage: {
      sync: { get: async () => ({}), set: async () => {} },
      session: {
        get: async (key) => (key in sessionStore ? { [key]: sessionStore[key] } : {}),
        set: async (obj) => Object.assign(sessionStore, obj),
        remove: async (key) => {
          delete sessionStore[key];
        },
      },
    },
    tabs: { onRemoved: listener('tabRemoved') },
    webNavigation: { onBeforeNavigate: listener('beforeNavigate'), onCommitted: listener('committed') },
    permissions: { contains: async () => false },
    scripting: {
      getRegisteredContentScripts: async () => [],
      registerContentScripts: async () => {},
      unregisterContentScripts: async () => {},
    },
  };
  return { chrome, reg, sessionStore };
}

async function load(chrome) {
  const saved = { chrome: global.chrome, fetch: global.fetch };
  global.chrome = chrome;
  await import(pathToFileURL(SRC).href + `?sw=${++loadCounter}`);
  return () => {
    global.chrome = saved.chrome;
    global.fetch = saved.fetch;
  };
}

test('onMessage ignores a message of an unrelated type (returns undefined, no sendResponse call)', async () => {
  const { chrome, reg } = stubChrome();
  const restore = await load(chrome);
  try {
    let responded = false;
    const result = reg.message({ type: 'something-else' }, {}, () => { responded = true; });
    assert.equal(result, undefined, "doesn't claim the async channel for a message it won't answer");
    assert.equal(responded, false);
  } finally {
    restore();
  }
});

test('onMessage answers link-hover:getTopComment by calling the API and forwarding its { comment } result', async () => {
  const { chrome, reg } = stubChrome();
  const restore = await load(chrome);
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ comment: { commentId: 'c1', body: 'hi', voteCount: 3 } }) };
  };
  try {
    const responded = await new Promise((resolve) => {
      const keepChannelOpen = reg.message(
        { type: 'link-hover:getTopComment', pageUrl: 'https://example.com/x', category: 'tldr' },
        {},
        resolve,
      );
      assert.equal(keepChannelOpen, true, 'must return true to keep the async sendResponse channel open');
    });
    assert.deepEqual(responded, { comment: { commentId: 'c1', body: 'hi', voteCount: 3 } });
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/comments\/top\?pageUrl=https%3A%2F%2Fexample\.com%2Fx&category=tldr$/);
  } finally {
    restore();
  }
});

test('onMessage forwards an API failure as { error } instead of leaving the sender hanging', async () => {
  const { chrome, reg } = stubChrome();
  const restore = await load(chrome);
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const responded = await new Promise((resolve) => {
      reg.message({ type: 'link-hover:getTopComment', pageUrl: 'https://example.com/x', category: 'tldr' }, {}, resolve);
    });
    assert.match(responded.error, /top-comment read failed: 500/);
  } finally {
    restore();
  }
});

// --- redirect provenance (issue #58): the webNavigation → storage.session recording glue ---------

// The listeners fire-and-forget an async storage update; drain the microtask queue so it lands.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a top-frame redirect records the pre-redirect URL under the tab key in storage.session', async () => {
  const { chrome, reg, sessionStore } = stubChrome();
  const restore = await load(chrome);
  try {
    reg.beforeNavigate({ tabId: 5, frameId: 0, url: 'https://example.com/article' });
    reg.committed({ tabId: 5, frameId: 0, url: 'https://example.com/article?session=abc', transitionQualifiers: [] });
    await settle();
    assert.deepEqual(sessionStore['redirectProvenance:5'], {
      pendingUrl: null,
      lastCommittedUrl: 'https://example.com/article?session=abc',
      from: 'https://example.com/article',
    });
  } finally {
    restore();
  }
});

test('a subframe navigation is ignored — it says nothing about the page the tab is on', async () => {
  const { chrome, reg, sessionStore } = stubChrome();
  const restore = await load(chrome);
  try {
    reg.beforeNavigate({ tabId: 5, frameId: 3, url: 'https://ads.example.net/frame' });
    reg.committed({ tabId: 5, frameId: 3, url: 'https://ads.example.net/frame', transitionQualifiers: [] });
    await settle();
    assert.deepEqual(sessionStore, {});
  } finally {
    restore();
  }
});

test('navigating on to a different page replaces the record with a no-redirect one', async () => {
  const { chrome, reg, sessionStore } = stubChrome();
  const restore = await load(chrome);
  try {
    reg.beforeNavigate({ tabId: 5, frameId: 0, url: 'https://example.com/a' });
    reg.committed({ tabId: 5, frameId: 0, url: 'https://example.com/a?v=2', transitionQualifiers: [] });
    reg.beforeNavigate({ tabId: 5, frameId: 0, url: 'https://example.com/elsewhere' });
    reg.committed({ tabId: 5, frameId: 0, url: 'https://example.com/elsewhere', transitionQualifiers: [] });
    await settle();
    assert.equal(sessionStore['redirectProvenance:5'].from, null);
  } finally {
    restore();
  }
});

test('closing the tab removes its provenance record', async () => {
  const { chrome, reg, sessionStore } = stubChrome();
  const restore = await load(chrome);
  try {
    reg.beforeNavigate({ tabId: 5, frameId: 0, url: 'https://example.com/a' });
    reg.committed({ tabId: 5, frameId: 0, url: 'https://example.com/a?v=2', transitionQualifiers: [] });
    await settle();
    assert.ok(sessionStore['redirectProvenance:5'], 'the record exists while the tab lives');
    reg.tabRemoved(5);
    await settle();
    assert.equal('redirectProvenance:5' in sessionStore, false);
  } finally {
    restore();
  }
});

test('onInstalled and onStartup both trigger the hover-registration reconciliation without throwing', async () => {
  const { chrome, reg } = stubChrome();
  const restore = await load(chrome);
  try {
    await assert.doesNotReject(() => reg.installed());
    await assert.doesNotReject(() => reg.startup());
  } finally {
    restore();
  }
});
