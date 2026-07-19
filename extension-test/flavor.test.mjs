// Guards the dev/prod build flavors (npm run build:dev / build:prod). The dev flavor must point the
// extension at the DEV API (so dev testing can't touch prod data), and the prod flavor must be
// unchanged from the pre-flavor behavior. Only the three keys the injector reads are mapped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { flavorEnv, injectConfig, extensionDir } from '../dev/build/tools/build-zip.mjs';

function stage() {
  const dir = mkdtempSync(join(tmpdir(), 'tldr-flavor-'));
  cpSync(resolve(extensionDir, 'config.mjs'), resolve(dir, 'config.mjs'));
  cpSync(resolve(extensionDir, 'manifest.json'), resolve(dir, 'manifest.json'));
  return dir;
}

// A repo env where dev and prod point at physically distinct APIs. Prod is the prod app stack's
// API Gateway URL (CloudFront isn't in front of prod yet); dev is the dev stack's — distinct ids.
const ENV = {
  API_BASE_URL: 'https://prod123.execute-api.il-central-1.amazonaws.com',
  API_BASE_URL_DEV: 'https://abc123.execute-api.il-central-1.amazonaws.com',
  GOOGLE_CLIENT_ID: '111.apps.googleusercontent.com',
};

test('dev flavor selects the *_DEV overrides (points the extension at the dev API)', () => {
  const env = flavorEnv('dev', ENV);
  assert.equal(env.API_BASE_URL, ENV.API_BASE_URL_DEV);
  // No GOOGLE_CLIENT_ID_DEV set => falls back to the shared (prod) client id, per the locked decision.
  assert.equal(env.GOOGLE_CLIENT_ID, ENV.GOOGLE_CLIENT_ID);
});

test('prod flavor uses the unsuffixed values (unchanged from before flavors existed)', () => {
  const env = flavorEnv('prod', ENV);
  assert.equal(env.API_BASE_URL, ENV.API_BASE_URL);
  assert.equal(env.GOOGLE_CLIENT_ID, ENV.GOOGLE_CLIENT_ID);
});

test('build:dev injects the dev API into staged config.mjs', () => {
  const dir = stage();
  try {
    injectConfig(dir, flavorEnv('dev', ENV));
    const config = readFileSync(resolve(dir, 'config.mjs'), 'utf8');
    assert.match(config, /export const API_BASE_URL = 'https:\/\/abc123\.execute-api\.il-central-1\.amazonaws\.com';/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('build:prod injects the prod API — distinct from dev', () => {
  const dir = stage();
  try {
    injectConfig(dir, flavorEnv('prod', ENV));
    const config = readFileSync(resolve(dir, 'config.mjs'), 'utf8');
    assert.match(config, /export const API_BASE_URL = 'https:\/\/prod123\.execute-api\.il-central-1\.amazonaws\.com';/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
