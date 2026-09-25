## 2026-08-17 · born · Claudinite growth: extract lessons (#288)
- **Source:** two sessions (#253, #264) piped `test:all` through `tail -N`, lost the real exit code
  and earlier sub-suites' summaries, and paid a full ~13-15s re-run each.
- **Reason:** name the chain's composition and the redirect-and-grep invocation so the verification
  reads the whole result once.
- **Actor:** the growth-extract run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the `##` section heading "never pipe it through `tail`" in RULES.md, with the
  literal invocation in a fence.
- **Landed:** #288, Refs #271.

## 2026-08-23 · weakened · the tail prohibition left to the canon (#358)
- **Reason:** basics/RULES.md's rule on piping a long command's output through `tail` now carries
  the prohibition and its why verbatim; the local residue is `test:all`'s composition and the
  redirect command.
- **Actor:** the growth-dedup run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #358, Refs #331.

## 2026-09-25 · reworded · brought onto the marker convention (#614)
- **Reason:** the `##` section became one marked rule keyed to running the suite; the command chain
  and the fenced invocation kept verbatim.
- **Actor:** @missingbulb (owner), approving the restructure in a Claude Code session.
- **Landed:** #614
