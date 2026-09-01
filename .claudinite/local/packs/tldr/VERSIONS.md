# Version history

The change record for this pack. A local pack is neither versioned nor distributed, so this table
carries one row per change automatic work made to it — a prose rule added or removed, a check
created, a rule corrected against a probe or deleted as irrelevant.

| Date | Task | Change |
|---|---|---|
| 2026-08-30 | `rule-revalidation` | Corrected the size claim in **`actions_list list_workflow_runs` ignores `per_page` for this repo's busiest workflows** — probed directly against `chrome-extension-release.yml`: run objects no longer embed `repository`/`head_repository` sub-objects (only a slim `head_commit` carrying just the commit message survives), so a run is ~2.5KB, not the ~14KB the rule assumed, and 30 of them land around 75KB rather than ~410KB. The rest of the rule (per_page ignored, still blows the token cap, overflow file path, the two `workflow_call`-only workflows reading `total_count: 0`) held and was reconfirmed unchanged. |
| 2026-08-23 | `growth-dedup` | Stripped the generic tail/head anti-pattern explanation from **`npm run test:all` chains four sub-suites** — now covered verbatim by `basics/RULES.md`'s "Piping a long command's output through `tail` (or `head`) to keep it readable" (discards `$?`, truncates earlier summary lines, fix: redirect to a file and `grep` it). Kept the residue: `test:all`'s exact composition and the redirect command. |
