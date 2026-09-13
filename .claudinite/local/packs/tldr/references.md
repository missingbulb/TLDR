# References

Rationale for `RULES.md` entries carrying an `(n)` marker — maintenance and review only; no rule
sends its reader here, and no session loads it. See the `writing-pack-prose` skill (in the
mounted canon) for the convention this file serves.

- **(RULES-1)** The scheduler cutover that made the daily leg gated on `mode: daily` is #107. The
  read-the-job-not-the-conclusion rule was settled by #93/#94 (run 29229001858): three separate
  triage passes (07-16, 07-18, 07-26) each re-derived that no later run had re-executed the
  `daily / publish` step, and each re-nominated whichever repo-side bug happened to be open at the
  time as an unconfirmed "suspected root cause". No later triage has needed to re-derive this since
  (no matching failure issue filed after 07-26 as of 2026-09-13) — but that gap is expected rather
  than telling: the `ship_paths`-diff gate #93/#94 were diagnosing was itself replaced by the
  2026-08-21 release-model overhaul (RULES-3) with a version-already-released gate, so the specific
  mechanism those issues traced no longer exists to misfire. The general lesson — a scheduled
  short-circuit reads as a green run conclusion regardless of what gates it — still applies to
  whatever gates `daily / check` today, so the rule stands; reaffirm by re-checking the gate's
  current mechanism (RULES.md's own text) against `chrome-extension-daily-release.yml`'s `check`
  job rather than re-deriving from a new failure issue.
- **(RULES-2)** #245 is the open decision tracking the real fix for the align step's fragility.
- **(RULES-3)** The chrome-extension pack's 2026-08-21 release-model overhaul (engine 4 →
  60820.1 line, pack 2 → 60821.1) moved the delta: `chrome-extension-daily-release.yml` no longer
  bumps anything — a PR touching a shipped file now raises the patch itself (`cer/version-bumped`),
  with `cer/version-sync` catching a forgotten root file since a human is in that loop. Reaffirm by
  checking `tldr/release-root-version-align`'s `WORKFLOW` constant still names
  `chrome-extension-bump-version.yml`.
- **(RULES-4)** 2026-08-17's `growth-extract` run (dispatch #271, 9 parallel readers) hit the
  collision directly and had to detect it via line-count/md5 mismatches, then recover with a fresh
  unique filename per agent.
- **(RULES-5)** `growth-discover-packs`'s #113 run authored the `tldr-categories` local pack
  encoding this contract as a pack rule; #121 (the pack) was closed unmerged over this, #123 landed
  the correction as this same rule, and #220's `growth-dedup` later pruned it on the mistaken claim
  that the canon now carries it (it doesn't) — this rule restores it. The `categories.mjs`
  presentation-lockstep gap `tldr-categories` was reaching for is real and still unaddressed in
  `dev/requirements/`. Reaffirm by checking whether that gap has since been closed there — if so,
  the worked example may be retired.
