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
  // In-memory chrome.storage.local, emitting onChanged like the real API so the SW's first-run popup
  // reconciliation fires; localStore is inspectable by the context-menu test below.
  const localStore = {};
  const changeListeners = [];
  const setPopupCalls = [];
  const contextMenuCreated = [];
  const calls = { sidePanelOpen: [] };
  const chrome = {
    runtime: {
      onConnect: listener('connect'),
      onInstalled: listener('installed'),
      onStartup: listener('startup'),
      onMessage: listener('message'),
      getManifest: () => ({ version: '9.9.9-test' }),
    },
    action: { onClicked: listener('clicked'), setPopup: async ({ popup }) => setPopupCalls.push(popup) },
    contextMenus: {
      onClicked: listener('contextClicked'),
      removeAll: async () => { contextMenuCreated.length = 0; },
      create: (item) => contextMenuCreated.push(item),
    },
    sidePanel: { open: async ({ tabId }) => calls.sidePanelOpen.push(tabId) },
    storage: {
      sync: { get: async () => ({}), set: async () => {} },
      session: {
        get: async (key) => (key in sessionStore ? { [key]: sessionStore[key] } : {}),
        set: async (obj) => Object.assign(sessionStore, obj),
        remove: async (key) => {
          delete sessionStore[key];
        },
      },
      local: {
        get: async (key) => (key in localStore ? { [key]: localStore[key] } : {}),
        set: async (obj) => {
          const changes = {};
          for (const [k, v] of Object.entries(obj)) {
            changes[k] = { oldValue: localStore[k], newValue: v };
            localStore[k] = v;
          }
          for (const fn of changeListeners) fn(changes, 'local');
        },
      },
      onChanged: { addListener: (fn) => changeListeners.push(fn) },
    },
    tabs: {
      onRemoved: listener('tabRemoved'),
      query: async () => [{ id: 7, active: true }],
    },
    webNavigation: { onBeforeNavigate: listener('beforeNavigate'), onCommitted: listener('committed') },
    permissions: { contains: async () => false },
    scripting: {
      getRegisteredContentScripts: async () => [],
      registerContentScripts: async () => {},
      unregisterContentScripts: async () => {},
    },
  };
  return { chrome, reg, sessionStore, localStore, setPopupCalls, contextMenuCreated, calls };
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

// --- toolbar icon open/close + right-click category switch (issue #25) ---------------------------

const settleMenus = () => new Promise((resolve) => setTimeout(resolve, 0));

test('first run (no category chosen) shows the category-menu popup; choosing one clears it', async () => {
  const { chrome, reg, setPopupCalls, localStore } = stubChrome();
  const restore = await load(chrome);
  try {
    await reg.installed();
    await settleMenus();
    assert.equal(
      setPopupCalls[setPopupCalls.length - 1],
      'src/category-menu.html',
      'with no category chosen and no pane, the icon opens the first-run category menu',
    );

    // A category gets chosen (via the popup or the context menu): the first-run popup gives way.
    await chrome.storage.local.set({ currentCategory: 'tldr' });
    await settleMenus();
    assert.equal(localStore.currentCategory, 'tldr');
    assert.equal(setPopupCalls[setPopupCalls.length - 1], '', 'once a category is known the popup is cleared');
  } finally {
    restore();
  }
});

test('a plain click with a category known and no pane open opens the side panel (no re-ask)', async () => {
  const { chrome, reg, calls } = stubChrome();
  const restore = await load(chrome);
  try {
    await chrome.storage.local.set({ currentCategory: 'tldr' });
    await settleMenus();
    await reg.clicked({ id: 42 });
    assert.deepEqual(calls.sidePanelOpen, [42], 'the click opens the pane for the clicked tab');
  } finally {
    restore();
  }
});

test('a plain click while a pane is open closes it (and does not open another)', async () => {
  const { chrome, reg, calls } = stubChrome();
  const restore = await load(chrome);
  try {
    const messages = [];
    const port = { name: 'panel', postMessage: (m) => messages.push(m), onDisconnect: { addListener() {} } };
    reg.connect(port);
    await settleMenus();
    await reg.clicked({ id: 42 });
    assert.deepEqual(messages, [{ type: 'close' }], 'clicking with a pane open asks it to close');
    assert.deepEqual(calls.sidePanelOpen, [], 'it does not also open the pane');
  } finally {
    restore();
  }
});

test('onInstalled builds one action context-menu item per category', async () => {
  const { chrome, reg, contextMenuCreated } = stubChrome();
  const restore = await load(chrome);
  try {
    await reg.installed();
    assert.deepEqual(
      contextMenuCreated.map((m) => m.id),
      ['tldr-category:tldr', 'tldr-category:spoiler', 'tldr-category:chitchat'],
    );
    for (const item of contextMenuCreated) assert.deepEqual(item.contexts, ['action']);
  } finally {
    restore();
  }
});

test('picking a category from the right-click menu records it and opens the pane', async () => {
  const { chrome, reg, localStore, calls } = stubChrome();
  const restore = await load(chrome);
  try {
    await reg.contextClicked({ menuItemId: 'tldr-category:spoiler' }, { id: 9 });
    await settleMenus();
    assert.equal(localStore.currentCategory, 'spoiler', 'the picked category becomes the current category');
    assert.deepEqual(calls.sidePanelOpen, [9], 'picking a category opens/switches the pane');
  } finally {
    restore();
  }
});

test('a context-menu click for an unrelated item is ignored', async () => {
  const { chrome, reg, localStore, calls } = stubChrome();
  const restore = await load(chrome);
  try {
    await reg.contextClicked({ menuItemId: 'some-other-menu' }, { id: 9 });
    await settleMenus();
    assert.equal('currentCategory' in localStore, false, 'no category recorded for a foreign menu item');
    assert.deepEqual(calls.sidePanelOpen, [], 'no pane opened for a foreign menu item');
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
