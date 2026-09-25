## 2026-08-13 · born · Claudinite growth: extract lessons (#249)
- **Source:** #241 added a step to the vendored `chrome-extension-daily-release.yml` aligning the
  repo-root `package.json`, load-bearing because the release config bumps only `manifest_path` and
  `package_json_path`; `chrome-release-vendoring`'s materialize is an unconditional verbatim
  overwrite with no per-repo exemption seam and would delete it (#245), so the step is fragile in a
  specific, repeating way.
- **Reason:** the canon's never-hand-edit line would lead a baselining run to land the stub over the
  local delta.
- **Actor:** the growth-extract run, merged by @missingbulb (owner).
- **Mechanism:** prose carrying only the residue the new blocking check
  `tldr/release-root-version-align` (born in the same PR, keyed on the workflow naming the root
  `package.json`) cannot: that the canon line does not hold for this path.
- **Retire when:** #245, the open decision on the real fix, gives the step a home materialize does
  not overwrite.
- **Landed:** #249, Refs #248.

## 2026-08-21 · reworded · the align step moved to the bump-version workflow (#329)
- **Source:** the chrome-extension pack's 2026-08-21 release-model overhaul (pack 2 -> 60821.1): the
  daily release no longer bumps anything, a PR touching a shipped file raises the patch itself
  (`cer/version-bumped`) with `cer/version-sync` catching a forgotten root file since a human is in
  that loop, so the only unattended version-write left is the minor/major dispatch.
- **Reason:** the align step and `tldr/release-root-version-align`'s `WORKFLOW` moved to
  `chrome-extension-bump-version.yml`, leaving `chrome-extension-daily-release.yml` a pure,
  un-diverged stub copy; the rule now names the check's constant as the source of truth rather than
  one path.
- **Actor:** the claudinite-lifecycle update run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Retire when:** `tldr/release-root-version-align`'s `WORKFLOW` constant no longer names
  `chrome-extension-bump-version.yml` (reaffirm against it).
- **Landed:** #329, Refs #312.

## 2026-09-02 · reworded · citations moved out to references.md (#442)
- **Reason:** the references convention: #245 and the 2026-08-21 overhaul narrative moved to
  `references.md` (RULES-2, RULES-3). Shrink-only.
- **Actor:** an implement-request run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #442, Refs #437.

## 2026-09-25 · reworded · brought onto the marker convention (#614)
- **Reason:** the `##` section split: the baselining directive is this rule, keyed to receiving a
  withheld file; why the step is load-bearing, the vendoring overwrite and the 2026-08-21 move now
  sit on this file, and the preprocessing procedure became canon-clone-apply.
- **Actor:** @missingbulb (owner), approving the restructure in a Claude Code session.
- **Landed:** #614
