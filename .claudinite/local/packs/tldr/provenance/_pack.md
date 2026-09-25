## 2026-07-27 · born · Claudinite growth: extract lessons (#120)
- **Source:** the repo's first extracted lesson (the three version records, #87, #109) had no home
  in the mounted canon.
- **Reason:** a home for repo-level lessons that are not a canon rule; longer-form, activity-scoped
  guidance stays in `dev/procedures/`, and this pack carries only short, always-on rules.
- **Actor:** the growth-extract run over #114's window, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a local pack declared as `local/tldr`, `detect: null`, prose in `RULES.md`; prose
  only at birth because each lesson's deterministic half was already guarded elsewhere (a canon
  check, a workflow gate), with a lesson that can be made deterministic to land as a rule in this
  pack rather than a paragraph.
- **Landed:** #120, Refs #114.

## 2026-07-31 · scope-changed · manifest migrated to the closed vocabulary (#153)
- **Reason:** canon made the pack manifest a closed vocabulary with a required `ruleRoutingGuidance`
  and shipped no migration record, so the manifest was migrated by hand.
- **Actor:** a manual baselining run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `ruleRoutingGuidance` naming release-pipeline gotchas as belonging and portable
  practice as excluded; `rules` renamed `worldRules`.
- **Landed:** #153.

## 2026-07-31 · reworded · the pack's first coded check (#162)
- **Reason:** `tldr/comment-class-menu` made the pack no longer prose only, so the manifest's "prose
  only for now" became "most are prose".
- **Actor:** the prose-to-checks sweep, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #162, Refs #159.
