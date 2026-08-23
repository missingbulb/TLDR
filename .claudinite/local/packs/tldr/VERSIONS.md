# Version history

The change record for this pack. A local pack is neither versioned nor distributed, so this table
carries one row per change automatic work made to it — a prose rule added or removed, a check
created, a rule corrected against a probe or deleted as irrelevant.

| Date | Task | Change |
|---|---|---|
| 2026-08-23 | `growth-dedup` | Stripped the generic tail/head anti-pattern explanation from **`npm run test:all` chains four sub-suites** — now covered verbatim by `basics/RULES.md`'s "Piping a long command's output through `tail` (or `head`) to keep it readable" (discards `$?`, truncates earlier summary lines, fix: redirect to a file and `grep` it). Kept the residue: `test:all`'s exact composition and the redirect command. |
