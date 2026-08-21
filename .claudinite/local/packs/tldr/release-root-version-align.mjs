import { finding } from '../../../shared/engine/checks/helpers/findings.mjs';

// A VENDORED workflow under `.github/workflows/` carries this repo's one
// deliberate delta over its canon stub: a step that aligns the repo-root
// package.json to a version the pipeline just bumped. It is load-bearing — the
// release config only bumps `manifest_path` and `package_json_path`, so without
// it the root file falls behind and both the `sharedConstants` version entry in
// .claudinite-checks.json and `cer/version-sync` go BLOCKING.
//
// WHICH FILE CARRIES IT MOVED with the chrome-extension pack's release-model
// overhaul (2026-08-21): the only automated, unattended version-write left in
// the pipeline is the deliberate minor/major dispatch
// (`chrome-extension-bump-version.yml`) — the routine patch bump that used to
// run inside the daily workflow's own `bump` job now belongs to the PR that
// touches a shipped file (`cer/version-bumped`), with a human in the loop who
// `cer/version-sync` will stop just as loudly if they forget the root file by
// hand. `chrome-extension-daily-release.yml` no longer bumps anything at all —
// it only checks whether the version already on `main` has shipped — so it is
// safe to take as a pure, un-diverged stub copy again.
//
// The delta is fragile in a specific, repeating way: the pack's
// `chrome-release-vendoring` migration MATERIALIZES this path — an unconditional
// verbatim overwrite from the stub, with no per-repo exemption seam (unlike a
// check finding, which .claudinite-checks.json can `accept`). Baselining
// re-attempts that write every cycle, so any agent that lands the withheld file
// mechanically deletes the step and silently re-opens the drift #241 closed.
// Issue #245 is the open decision on the real fix (teach release.config the root
// file, or give materialize an extension point); until it lands, this check is
// what makes the deletion loud instead of silent. When #245 resolves, delete
// this rule with the step.
//
// It keys on the BEHAVIOUR, not the step's label: the align step is the only
// place the workflow names the repo-root `package.json` as a literal file, since
// the stub reaches the two release-config paths through
// `${{ steps.cfg.outputs.* }}` only. So renaming or rewording the step keeps
// this silent, and only actually dropping the root-file write fires it.
const WORKFLOW = '.github/workflows/chrome-extension-bump-version.yml';

// The quoted literal the align step's inline node script reads and writes.
const ROOT_PACKAGE_JSON = /(["'])package\.json\1/;

const rule = {
  id: 'tldr/release-root-version-align',
  severity: 'blocking',
  description: "The daily-release workflow must keep aligning the repo-root package.json to the bumped version — it is this repo's local delta over the vendored stub",
  doc: '.claudinite/local/packs/tldr/RULES.md',
  scope: 'world',
  why: 'the release config bumps only the manifest and extension package.json, so without this step the repo-root package.json falls behind after every daily release and the version sharedConstants entry plus cer/version-sync both go BLOCKING (#241, #245)',

  run(ctx) {
    const text = ctx.read(WORKFLOW);
    // A missing file is `cer/release-workflows`'s finding, not this one.
    if (text === null) return [];
    if (ROOT_PACKAGE_JSON.test(text)) return [];

    return [finding(rule, {
      file: WORKFLOW,
      what: 'the bump job no longer writes the repo-root package.json — the "Align the root package.json to the bumped version" step is gone, so the next daily release will bump only the two release-config paths',
      fix: `restore the step from commit 2529b63 (PR #241) — it replaces the single \`"version": "X.Y.Z"\` token in the root package.json with \`steps.bump.outputs.version\` before the push. If it vanished after a baselining cycle, the chrome-release-vendoring materialize overwrote this file with the canon stub: re-apply the step rather than accepting the stub, and say so on #245`,
    })];
  },
};

export default rule;
