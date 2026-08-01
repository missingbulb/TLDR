import { posix, dirname } from 'node:path';
import { finding } from '../../../shared/engine/checks/helpers/findings.mjs';

// The testable half of RULES.md's "The three version records": the repo-root
// `package.json` is the one version record NOTHING automated bumps. The daily
// auto-release patch-bumps exactly the two paths named in `.github/release.config`
// (`manifest_path`, `package_json_path`) and then runs that config's
// `test_command` — so a test in that suite asserting the ROOT version against the
// manifest fails on every single release, after the bump has moved only the two
// extension files. The trap is attractive precisely because it looks like closing
// the loop on the recurring `cer/version-sync` drift finding; it instead breaks
// the pipeline that produces the drift.
//
// The root/manifest alignment is `cer/version-sync`'s to file and a human's to
// resolve (align the root file UP to the manifest). Closing the loop properly
// means changing WHAT THE BUMP TOUCHES — the release config — never what the
// release suite asserts.
//
// Scoped by PARSING, not grepping. A read of the root `package.json` is only a
// defect inside the suite the release actually runs, so the rule resolves that
// suite: `.github/release.config`'s `test_command` -> each `npm [--prefix DIR]
// test` -> that package's `test` script -> the `node --test` globs -> the files.
// A test elsewhere in the repo (dev/requirements/, a server suite) is out of the
// release path and out of this rule.
//
// Detection inside a matched file resolves path EXPRESSIONS rather than matching
// text: every run of comma-adjacent string literals ending in `package.json` is
// resolved against the file's own directory — or against a `const` that names a
// directory built the same way (`resolve(dirname(fileURLToPath(import.meta.url)),
// '..', 'extension')`), which is how this repo's real suite reaches
// `extension/package.json`. That distinction is the whole point: the legitimate
// `extension/package.json` read and the forbidden root read are the same six
// characters of text and differ only in where they resolve. Best-effort by
// construction — a path assembled through a helper call or a template literal is
// not resolved, so this under-reports rather than mis-reports.
//
// BLOCKING: the failure mode is a release that cannot go green, and unlike the
// version drift itself it is fully within the branch's power to fix — delete the
// assertion.

const RELEASE_CONFIG = '.github/release.config';
const ROOT_PACKAGE_JSON = 'package.json';

// `key=value` lines; the file is a flat config read by the canon release action.
function configValue(text, key) {
  for (const line of (text ?? '').split('\n')) {
    const m = new RegExp(String.raw`^\s*${key}\s*=\s*(.*)$`).exec(line);
    if (m) return m[1].trim();
  }
  return null;
}

// Package directories whose `test` script the command runs: `npm test`,
// `npm run test`, `npm --prefix extension test`.
function npmTestPackageDirs(command) {
  const dirs = [];
  for (const segment of command.split(/&&|\|\||;/)) {
    if (!/\bnpm\b[^\n]*\btest\b/.test(segment)) continue;
    const prefix = /--prefix\s+(\S+)/.exec(segment);
    dirs.push(prefix ? prefix[1] : '.');
  }
  return dirs;
}

// The path-ish arguments of a `node --test` script line: quoted globs and bare
// file paths. Everything else (`node`, `--test`, `TZ=UTC`) has no extension and
// no wildcard, so it drops out.
function testPathArgs(script) {
  const args = [];
  for (const m of (script ?? '').matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)) {
    const arg = m[1] ?? m[2] ?? m[3];
    if (arg.includes('*') || /\.(?:m|c)?js$/.test(arg)) args.push(arg);
  }
  return args;
}

function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*' && glob[i + 2] === '/') { out += '(?:[^/]+/)*'; i += 2; continue; }
    if (c === '*' && glob[i + 1] === '*') { out += '.*'; i += 1; continue; }
    if (c === '*') { out += '[^/]*'; continue; }
    out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

// Repo-relative path patterns of every file the release's test command runs.
function releaseSuitePatterns(ctx) {
  const command = configValue(ctx.read(RELEASE_CONFIG), 'test_command');
  if (!command) return [];
  const patterns = [];
  for (const dir of npmTestPackageDirs(command)) {
    const pkgPath = posix.normalize(posix.join(dir, 'package.json'));
    let pkg;
    try { pkg = JSON.parse(ctx.read(pkgPath)); } catch { continue; }
    for (const arg of testPathArgs(pkg?.scripts?.test)) {
      patterns.push(globToRegExp(posix.normalize(posix.join(dir, arg))));
    }
  }
  return patterns;
}

const LITERAL_RE = /(['"])([^'"\n]*)\1/g;

// Every run of comma-adjacent string literals that ends in a `package.json`
// segment, plus the identifier (if any) the run is anchored on.
function packageJsonExpressions(text) {
  const literals = [...text.matchAll(LITERAL_RE)]
    .map((m) => ({ start: m.index, end: m.index + m[0].length, value: m[2] }));
  const found = [];
  for (let i = 0; i < literals.length; i += 1) {
    if (!/(?:^|\/)package\.json$/.test(literals[i].value)) continue;
    const segments = [literals[i].value];
    let start = literals[i].start;
    for (let j = i - 1; j >= 0 && /^\s*,\s*$/.test(text.slice(literals[j].end, start)); j -= 1) {
      segments.unshift(literals[j].value);
      start = literals[j].start;
    }
    const anchor = /([A-Za-z_$][\w$]*)\s*,\s*$/.exec(text.slice(Math.max(0, start - 120), start));
    found.push({ base: anchor ? anchor[1] : null, segments, index: start });
  }
  return found;
}

// `const NAME = <path expression>` declarations, resolved to repo-relative
// directories against the file's own directory.
function declaredDirs(text, fileDir) {
  const dirs = new Map();
  for (const m of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*(?:\n[^;=]*)?)/g)) {
    const segments = [...m[2].matchAll(LITERAL_RE)].map((l) => l[2]).filter((v) => v && !v.includes(' '));
    if (!segments.length) continue;
    dirs.set(m[1], posix.normalize(posix.join(fileDir, ...segments)));
  }
  return dirs;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const rule = {
  id: 'tldr/release-suite-root-version',
  severity: 'blocking',
  description: 'No test in the release config\'s `test_command` suite may read the repo-root `package.json` version',
  doc: '.claudinite/local/packs/tldr/RULES.md',
  why: 'the daily auto-release patch-bumps only the two paths in .github/release.config (manifest_path, package_json_path) and then runs test_command — the root package.json is never bumped, so a suite that asserts its version fails every release',

  run(ctx) {
    const patterns = releaseSuitePatterns(ctx);
    if (!patterns.length) return [];

    const findings = [];
    for (const file of ctx.files) {
      if (!patterns.some((re) => re.test(file))) continue;
      const text = ctx.read(file);
      // Only a version assertion is the trap; a suite reading the root manifest
      // for a field the bump never moves is fine.
      if (text === null || !/\bversion\b/.test(text)) continue;
      const fileDir = dirname(file) === '.' ? '' : dirname(file);
      const dirs = declaredDirs(text, fileDir);
      for (const expr of packageJsonExpressions(text)) {
        const base = expr.base ? dirs.get(expr.base) : fileDir;
        if (base === undefined) continue;
        if (posix.normalize(posix.join(base, ...expr.segments)) !== ROOT_PACKAGE_JSON) continue;
        findings.push(finding(rule, {
          file,
          line: lineOf(text, expr.index),
          what: `this file reads the repo-root \`${ROOT_PACKAGE_JSON}\` and asserts on a version, and it is run by \`${RELEASE_CONFIG}\`'s test_command`,
          fix: 'delete the root-version assertion. The root package.json is the one version record nothing bumps, so it is stale by design after every auto-release — the recurring `cer/version-sync` finding is resolved by aligning the ROOT file UP to the manifest, by hand. If you want the loop closed for good, change what the bump touches (the paths in .github/release.config), never what the release suite asserts.',
        }));
        break; // one finding per file — the whole file is the defect
      }
    }
    return findings;
  },
};

export default rule;
