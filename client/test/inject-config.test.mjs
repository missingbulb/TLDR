// Guards the build-time config injection: real values are written into STAGED copies from the
// environment, and an empty environment leaves the committed placeholders untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { injectConfig, clientDir } from '../scripts/build-zip.mjs';

function stage() {
  const dir = mkdtempSync(join(tmpdir(), 'tldr-inject-'));
  cpSync(resolve(clientDir, 'config.mjs'), resolve(dir, 'config.mjs'));
  cpSync(resolve(clientDir, 'manifest.json'), resolve(dir, 'manifest.json'));
  return dir;
}

test('injectConfig writes env values into staged config.mjs and manifest.json', () => {
  const dir = stage();
  try {
    injectConfig(dir, {
      API_BASE_URL: 'https://d123.cloudfront.net',
      GOOGLE_CLIENT_ID: '999.apps.googleusercontent.com',
      EXTENSION_PUBLIC_KEY: 'MIIBIjANBgkqExamplePublicKeyAB',
    });
    const config = readFileSync(resolve(dir, 'config.mjs'), 'utf8');
    assert.match(config, /export const API_BASE_URL = 'https:\/\/d123\.cloudfront\.net';/);
    assert.match(config, /export const GOOGLE_CLIENT_ID = '999\.apps\.googleusercontent\.com';/);
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.host_permissions, ['https://d123.cloudfront.net/*']);
    assert.equal(manifest.key, 'MIIBIjANBgkqExamplePublicKeyAB');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the committed default points at dev (never prod), and config + manifest agree on the origin', () => {
  // "Dev as the committed default": any build that isn't the release pipeline talks to dev, never prod.
  // PROD is only ever the release-injected value, so the committed default must NOT be a prod URL, and
  // the two committed files that carry the origin must not drift apart.
  const config = readFileSync(resolve(clientDir, 'config.mjs'), 'utf8');
  const manifest = JSON.parse(readFileSync(resolve(clientDir, 'manifest.json'), 'utf8'));
  const apiBaseUrl = config.match(/export const API_BASE_URL = '([^']*)'/)?.[1];
  assert.ok(apiBaseUrl, 'config.mjs must export API_BASE_URL');
  // A prod build is the CloudFront domain; the committed default must never be that.
  assert.doesNotMatch(apiBaseUrl, /cloudfront\.net/, 'committed default must not point at prod (CloudFront)');
  // config + manifest must name the same origin (injectConfig keeps them in sync; the committed
  // defaults must too, or an un-injected build would request a host it lacks permission for).
  assert.deepEqual(manifest.host_permissions, [`${new URL(apiBaseUrl).origin}/*`]);
});

test('injectConfig leaves committed placeholders untouched when env is empty', () => {
  const dir = stage();
  try {
    const before = readFileSync(resolve(dir, 'config.mjs'), 'utf8');
    injectConfig(dir, {});
    assert.equal(readFileSync(resolve(dir, 'config.mjs'), 'utf8'), before);
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
    assert.ok(!('key' in manifest), 'no key injected when env is empty');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
