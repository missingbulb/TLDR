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
    // API_BASE_URL no longer injects host_permissions — the extension reaches the API via the
    // server's '*' CORS, so only the signing key is written into the manifest.
    assert.ok(!('host_permissions' in manifest), 'API_BASE_URL must not inject host_permissions');
    assert.equal(manifest.key, 'MIIBIjANBgkqExamplePublicKeyAB');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
