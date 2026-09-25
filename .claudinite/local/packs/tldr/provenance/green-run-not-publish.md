## 2026-07-29 · born · Claudinite growth: extract lessons (#147)
- **Source:** #93/#94 (run 29229001858): three triage passes (07-16, 07-18, 07-26) each re-derived
  that no later run had re-executed `daily / publish`, and each re-nominated a co-occurring
  repo-side bug (#87's version desync) as the unconfirmed root cause; the `mode: daily` gate is the
  scheduler cutover of #107. First extracted as #129, re-landed here after merge conflicts.
- **Reason:** record the settled reading so a fourth triage does not re-derive it.
- **Actor:** the growth-extract run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a `##` section in RULES.md, prose because it is a judgment about reading Actions
  history, not a testable property of a repo file.
- **Retire when:** later publish-leg triages stop re-deriving this.
- **Landed:** #147, Refs #97.

## 2026-08-12 · reworded · the version-desync example dropped (#241)
- **Reason:** #241 removed the version drift at its source, so the triage history names "whichever
  repo-side bug happened to be open" instead of #87's desync.
- **Actor:** @missingbulb (owner).
- **Landed:** #241, Closes #242.

## 2026-09-02 · reworded · citations moved out to references.md (#442)
- **Reason:** the references convention: the #107 cutover and the #93/#94 triage narrative moved to
  `references.md` (RULES-1), the act-time consequence kept inline. Shrink-only.
- **Actor:** an implement-request run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #442, Refs #437.

## 2026-09-20 · reworded · the short-circuit gate corrected (#580)
- **Source:** the revalidation read `chrome-extension-daily-release.yml` directly: `check` now
  decides by whether `v$version` already has a release/tag, with no `ship_paths` reference left (the
  2026-08-21 release-model overhaul replaced it).
- **Reason:** the rule described the retired `ship_paths`-diff gate. The same run searched issues
  back two months and found no recurrence of the mis-triage since #93/#94, and flagged the rule a
  retirement candidate for the owner; not applied.
- **Actor:** the rule-revalidation run, merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Landed:** #580, Refs #572.

## 2026-09-25 · reworded · brought onto the marker convention (#614)
- **Reason:** the `##` section became one marked rule keyed to the triage act; the #93/#94 evidence,
  lost from the tree when #586 deleted `references.md` unconverted, now sits on this file.
- **Actor:** @missingbulb (owner), approving the restructure in a Claude Code session.
- **Landed:** #614
