## 2026-07-29 · born · Claudinite growth: extract lessons (#147)
- **Source:** three triage passes over #93/#94 (07-16, 07-18, 07-26), each re-deriving that no later
  run had re-executed `daily / publish` and each re-nominating a co-occurring repo-side bug (#87's
  version desync) as the unconfirmed root cause; first extracted as #129, re-landed here after merge
  conflicts.
- **Reason:** record the settled reading so a fourth triage does not re-derive it.
- **Actor:** the growth-extract run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule under the green-release section, prose because it is a judgment
  about reading Actions history, not a testable property of a repo file.
- **Retire when:** later publish-leg triages stop re-deriving this.
- **Landed:** #147, Refs #97.
