# Version history

The change record for this pack. A local pack is neither versioned nor distributed, so this table
carries one row per change automatic work made to it — a prose rule added or removed, a check
created, a rule corrected against a probe or deleted as irrelevant.

| Date | Task | Change |
|---|---|---|
| 2026-08-24 | `rule-revalidation` | Corrected **`actions_list list_workflow_runs` ignores `per_page` for this repo's busiest workflows** — probed `list_workflow_runs` against `chrome-extension-daily-release.yml` and confirmed `total_count: 0` (it's `workflow_call`-only, never triggered directly), so the claim that the token-cap blow-up hits "release and daily-release workflows" was stale: only `chrome-extension-release.yml` (the sole chrome-extension workflow triggered by `push`/`workflow_dispatch`) accumulates run history and can blow the cap. Narrowed the sentence to name it specifically. |
| 2026-08-23 | `growth-dedup` | Stripped the generic tail/head anti-pattern explanation from **`npm run test:all` chains four sub-suites** — now covered verbatim by `basics/RULES.md`'s "Piping a long command's output through `tail` (or `head`) to keep it readable" (discards `$?`, truncates earlier summary lines, fix: redirect to a file and `grep` it). Kept the residue: `test:all`'s exact composition and the redirect command. |
