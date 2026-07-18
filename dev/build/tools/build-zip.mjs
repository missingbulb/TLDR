// Packages the extension into dist/tldr.zip — ONLY the shippable files, never dev/test
// tooling. Uses the system `zip` (present on CI runners). Run with `npm run build`.
// The zip name is stable (kebab-cased repo name, never version-stamped) per the shared
// chrome-extension-release standard, so a GitHub Release serves the newest build at a
// permanent URL: …/releases/latest/download/tldr.zip.
//
// Build-time config injection: the committed source points at the DEV stack (API_BASE_URL), with the
// client id and `key` left as placeholders. The PROD URL lives only in a GitHub variable (it's public,
// but kept out of the repo) and is injected here into STAGED copies of the files (never the committed
// source). With no API_BASE_URL in the env, the build keeps the committed dev default — so a plain
// build, and the release's headline tldr.zip (which the workflow builds with API_BASE_URL cleared),
// both stay on dev. The release workflow's OTHER build passes the prod URL to produce tldr-prod.zip,
// the only prod-pointed build and the sole thing uploaded to the store.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// This build tool lives in dev/build/tools/; the extension source is extension/ at
// the repo root (dev/build/tools -> ../../../extension).
export const extensionDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'extension');

// Exactly what ships. src/ and vendor/ contain only runtime files; tests live in extension-test/,
// package.json is the extension's npm manifest — none is listed here, so none is packaged.
// Editing this list? Mirror it into `.github/release.config` `ship_paths` (each entry prefixed
// `extension/`): the canon daily-release decides "did a deployable file change?" by prefix-matching
// that key, so the two must stay in lockstep — extension-test/release-ship-paths.test.mjs guards it.
export const SHIP = ['manifest.json', 'config.mjs', 'src', 'vendor', 'icons'];

export const ZIP_NAME = 'tldr.zip';

// Rewrite the STAGED config.mjs + manifest.json from the environment. Each value is optional; whatever
// is absent stays at its committed placeholder (so a partial env is a no-op, never a corruption).
//   API_BASE_URL          -> config.mjs API_BASE_URL (the extension reaches the API via the server's
//                            '*' CORS, so no manifest host_permissions is needed)
//   GOOGLE_CLIENT_ID      -> config.mjs GOOGLE_CLIENT_ID
//   EXTENSION_PUBLIC_KEY  -> manifest "key" (fixes the extension id to the registered one)
export function injectConfig(stageDir, env = process.env) {
  const { API_BASE_URL, GOOGLE_CLIENT_ID, EXTENSION_PUBLIC_KEY } = env;

  if (API_BASE_URL || GOOGLE_CLIENT_ID) {
    const configPath = resolve(stageDir, 'config.mjs');
    let config = readFileSync(configPath, 'utf8');
    if (API_BASE_URL) {
      config = config.replace(/(export const API_BASE_URL = )'[^']*'/, `$1'${API_BASE_URL}'`);
    }
    if (GOOGLE_CLIENT_ID) {
      config = config.replace(/(export const GOOGLE_CLIENT_ID = )'[^']*'/, `$1'${GOOGLE_CLIENT_ID}'`);
    }
    writeFileSync(configPath, config);
  }

  // Only EXTENSION_PUBLIC_KEY touches the manifest now — API_BASE_URL no longer injects
  // host_permissions (the extension reaches the API via the server's '*' CORS, not a host grant).
  if (EXTENSION_PUBLIC_KEY) {
    const manifestPath = resolve(stageDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.key = EXTENSION_PUBLIC_KEY;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

// Resolve which env vars feed the injector for a build flavor. The dev flavor prefers *_DEV overrides
// (so a dev build points the extension at the dev app-stack API, never prod), falling back to the
// unsuffixed value when no dev-specific one is set. prod (the default) uses the unsuffixed values as-is,
// so `npm run build` / `build:prod` behave identically to before flavors existed. Only the three keys
// the injector reads are mapped — nothing else.
export function flavorEnv(flavor = 'prod', env = process.env) {
  const pick = (key) => (flavor === 'dev' ? env[`${key}_DEV`] ?? env[key] : env[key]);
  return {
    API_BASE_URL: pick('API_BASE_URL'),
    GOOGLE_CLIENT_ID: pick('GOOGLE_CLIENT_ID'),
    EXTENSION_PUBLIC_KEY: pick('EXTENSION_PUBLIC_KEY'),
  };
}

export function buildZip(env = process.env) {
  // The zip goes to the repo-root dist/ — the forced-uniform standard location
  // the chrome-extension-release standard derives (dist/<kebab repo>.zip), the
  // same place GCEC and CrosswordChat write, so no per-repo zip_path config.
  const distDir = resolve(extensionDir, '..', 'dist');
  const stageDir = resolve(distDir, 'staging');
  const zipPath = resolve(distDir, ZIP_NAME);
  mkdirSync(distDir, { recursive: true });
  rmSync(stageDir, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  mkdirSync(stageDir, { recursive: true });

  // Stage exactly the shippable files (preserving mtimes for byte-stable zips), then inject config
  // into the staged copies only — the committed source is never modified.
  for (const entry of SHIP) {
    cpSync(resolve(extensionDir, entry), resolve(stageDir, entry), { recursive: true, preserveTimestamps: true });
  }
  injectConfig(stageDir, env);

  // -X strips extra file attributes so an unchanged build is byte-stable; -r recurses dirs.
  execFileSync('zip', ['-r', '-X', '-q', zipPath, ...SHIP], { cwd: stageDir });
  rmSync(stageDir, { recursive: true, force: true });
  return zipPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Optional first arg selects the build flavor (dev|prod); default prod keeps `npm run build` unchanged.
  const flavor = process.argv[2] || 'prod';
  console.log(`built ${buildZip(flavorEnv(flavor))} (${flavor})`);
}
