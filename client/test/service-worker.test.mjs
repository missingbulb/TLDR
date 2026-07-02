// service-worker.mjs has no dedicated unit test elsewhere; it's otherwise only exercised indirectly via
// the toolbar-toggle behavior case (dev/requirements/behavior/cases/toolbar-toggle.10.11.case.mjs),
// which doesn't touch the onMessage handler this file adds. Same pattern as that case: hand-build a
// fake `chrome`, install it as the global, then dynamically import the REAL module (cache-busted so a
// second test gets a fresh module evaluation, since the top-level code registers listeners on import).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'service-worker.mjs');
let loadCounter = 0;

function stubChrome({ fetchImpl } = {}) {
  const reg = {};
  const listener = (key) => ({ addListener: (fn) => { reg[key] = fn; } });
  const chrome = {
    runtime: {
      onConnect: listener('connect'),
      onInstalled: listener('installed'),
      onStartup: listener('startup'),
      onMessage: listener('message'),
      getManifest: () => ({ version: '9.9.9-test' }),
    },
    action: { onClicked: listener('clicked'), setPopup: async () => {} },
    storage: { sync: { get: async () => ({}), set: async () => {} } },
    permissions: { contains: async () => false },
    scripting: {
      getRegisteredContentScripts: async () => [],
      registerContentScripts: async () => {},
      unregisterContentScripts: async () => {},
    },
  };
  return { chrome, reg };
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
