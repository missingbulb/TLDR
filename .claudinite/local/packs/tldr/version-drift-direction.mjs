import { finding } from '../../../shared/engine/checks/helpers/findings.mjs';

// The testable half of RULES.md's "The three version records, and the two the
// pipeline actually bumps": the DIRECTION a version-drift correction moves.
//
// The daily auto-release patch-bumps exactly the two paths named in
// `.github/release.config` (`extension/manifest.json`, `extension/package.json`).
// Nothing automated touches the ROOT `package.json` — but `cer/version-sync`
// reads the repo-root `package.json` by name and compares it to the manifest, so
// the root file goes stale after every daily bump and the nightly sweep re-files
// it BLOCKING. That drift is expected; only the correction can be wrong.
//
// `cer/version-sync` is world-scope and only asks whether the two agree AT REST,
// and its fix line says "bump both together" — which is exactly the ambiguity
// this repo has paid for. Both wrong corrections end with the pair agreeing, so
// the canon check goes green on them:
//   - editing `extension/manifest.json` DOWN to the stale root version silently
//     un-ships the released version number (the manifest is the shipped,
//     user-visible record and the single source of truth);
//   - bumping the root PAST the shipped version turns a drift correction into an
//     unreleased release bump, and the next daily patch-bump then has to climb
//     over it.
// So this is a WORK-scope delta rule: it judges what this change did to the two
// version fields, never the state it found. A branch that touches neither field
// says nothing — the standing mismatch is `cer/version-sync`'s finding to make,
// and re-filing it here would double-report the expected drift.
//
// BLOCKING, unlike this pack's other rule: the condition lives in the branch's
// own files, so an edit retracts it and the finding converges within the session.
// (The advisory carve-out in RULES.md is for a condition no edit can undo.)

const MANIFEST = 'extension/manifest.json';
const ROOT_PKG = 'package.json';

// A version we can order. Anything else (a range, a pre-release, a missing
// field) is left alone rather than guessed at — the rule is about direction, and
// an unorderable pair has no direction to judge.
const parts = (v) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);

// -1 / 0 / +1, or null when either side is unorderable.
function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  if (!x || !y) return null;
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

const rule = {
  id: 'tldr/version-drift-direction',
  severity: 'blocking',
  description: 'A version-drift correction aligns the root `package.json` UP to `extension/manifest.json` — it never moves the manifest, and never goes past the shipped version',
  doc: '.claudinite/local/packs/tldr/RULES.md',
  scope: 'work',
  why: 'the manifest is the shipped, user-visible version and the only record the release pipeline bumps; both wrong corrections leave the pair agreeing, so `cer/version-sync` goes green on a manifest silently rolled back or a root file bumped past what was released',

  run(work) {
    const manifest = work.jsonPair(MANIFEST);
    const pkg = work.jsonPair(ROOT_PKG);
    // No manifest on one side of the change is a repo this rule has nothing to
    // say about (or the file being added) — not a drift correction.
    if (!manifest.head || !manifest.base) return [];

    const shipped = manifest.head.version;
    const out = [];

    if (compare(shipped, manifest.base.version) === -1) {
      out.push(finding(rule, {
        file: MANIFEST,
        what: `${MANIFEST}'s version moved DOWN, ${manifest.base.version} -> ${shipped}`,
        fix: `restore ${MANIFEST} to ${manifest.base.version} and raise the root package.json to that instead — the manifest is the shipped version and the single source of truth, so a drift correction never edits it down to match`,
      }));
    }

    if (pkg.head && pkg.base && pkg.head.version !== pkg.base.version && pkg.head.version !== shipped) {
      out.push(finding(rule, {
        file: ROOT_PKG,
        what: `the root package.json version moved ${pkg.base.version} -> ${pkg.head.version}, which is not the shipped manifest version ${shipped}`,
        fix: `set the root package.json version to ${shipped} — align it UP to the manifest and stop there; a drift correction is not a release bump, so never increment past the shipped version`,
      }));
    }

    return out;
  },
};

export default rule;
