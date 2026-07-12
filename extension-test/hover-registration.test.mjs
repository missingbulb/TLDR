// hover-registration.mjs only calls chrome.scripting/chrome.permissions/chrome.storage.sync — no DOM —
// so it's stubbed and unit-tested directly here, the same pattern auth.test.mjs uses for chrome.identity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerHoverContentScript,
  unregisterHoverContentScript,
  reconcileHoverRegistration,
  HOVER_ORIGINS,
  HOVER_ENABLED_KEY,
} from '../extension/src/hover-registration.mjs';

function stubChrome({ registered = [], enabled = undefined, granted = false } = {}) {
  const calls = { register: [], unregister: [], syncSet: [] };
  const store = enabled === undefined ? {} : { [HOVER_ENABLED_KEY]: enabled };
  globalThis.chrome = {
    scripting: {
      getRegisteredContentScripts: async ({ ids }) => registered.filter((r) => ids.includes(r.id)),
      registerContentScripts: async (scripts) => {
        calls.register.push(scripts);
        registered.push(...scripts);
      },
      unregisterContentScripts: async ({ ids }) => {
        calls.unregister.push(ids);
        const missing = ids.some((id) => !registered.some((r) => r.id === id));
        if (missing) throw new Error('not registered');
        for (const id of ids) {
          const i = registered.findIndex((r) => r.id === id);
          if (i >= 0) registered.splice(i, 1);
        }
      },
    },
    permissions: { contains: async () => granted },
    storage: {
      sync: {
        get: async (key) => (key in store ? { [key]: store[key] } : {}),
        set: async (obj) => {
          calls.syncSet.push(obj);
          Object.assign(store, obj);
        },
      },
    },
  };
  return { calls, registered, store };
}

test('registerHoverContentScript registers exactly the link-hover script over HOVER_ORIGINS', async () => {
  const { calls, registered } = stubChrome();
  await registerHoverContentScript();
  assert.equal(calls.register.length, 1);
  assert.deepEqual(calls.register[0], [{ id: 'link-hover', js: ['src/link-hover.mjs'], matches: HOVER_ORIGINS, runAt: 'document_idle' }]);
  assert.equal(registered.length, 1);
});

test('registerHoverContentScript is idempotent — a second call is a no-op, not a duplicate-id error', async () => {
  const { calls } = stubChrome();
  await registerHoverContentScript();
  await registerHoverContentScript();
  assert.equal(calls.register.length, 1, 'only the first call actually registers');
});

test('unregisterHoverContentScript removes the registered script', async () => {
  const { calls, registered } = stubChrome({ registered: [{ id: 'link-hover' }] });
  await unregisterHoverContentScript();
  assert.equal(calls.unregister.length, 1);
  assert.equal(registered.length, 0);
});

test('unregisterHoverContentScript is idempotent — unregistering an already-absent script does not throw', async () => {
  stubChrome({ registered: [] });
  await assert.doesNotReject(() => unregisterHoverContentScript());
});

test('reconcileHoverRegistration registers when the stored flag is enabled and the permission is granted', async () => {
  const { calls } = stubChrome({ enabled: true, granted: true });
  await reconcileHoverRegistration();
  assert.equal(calls.register.length, 1);
  assert.equal(calls.syncSet.length, 0, 'no self-heal needed — flag and permission already agree');
});

test('reconcileHoverRegistration self-heals: enabled flag but a revoked permission flips the flag off and unregisters', async () => {
  const { calls, store } = stubChrome({ registered: [{ id: 'link-hover' }], enabled: true, granted: false });
  await reconcileHoverRegistration();
  assert.equal(store[HOVER_ENABLED_KEY], false, 'the desynced flag is corrected');
  assert.equal(calls.unregister.length, 1);
  assert.equal(calls.register.length, 0);
});

test('reconcileHoverRegistration unregisters (without touching the flag) when never enabled', async () => {
  const { calls } = stubChrome({ registered: [{ id: 'link-hover' }], enabled: false, granted: false });
  await reconcileHoverRegistration();
  assert.equal(calls.unregister.length, 1);
  assert.equal(calls.syncSet.length, 0, 'already-false flag needs no write');
});

test('reconcileHoverRegistration treats an absent stored flag the same as disabled', async () => {
  const { calls } = stubChrome({ registered: [{ id: 'link-hover' }], granted: true }); // enabled left undefined
  await reconcileHoverRegistration();
  assert.equal(calls.unregister.length, 1);
  assert.equal(calls.register.length, 0);
});
