## 2026-08-13 · born · Claudinite growth: extract lessons (#249)
- **Source:** the baselining that surfaced #245: this repo's mounted `apply.mjs` wrote nothing
  because the `chrome-release-vendoring` record had aged out of the vendored subset.
- **Reason:** reproducing preprocessing's intended write is how the withheld workflow's stub is
  obtained for the union.
- **Actor:** the growth-extract run, merged by @missingbulb (owner).
- **Mechanism:** a paragraph of the withheld-workflow section in RULES.md, prose because it is a
  procedure run by hand during a baselining, not a repo signature.
- **Landed:** #249, Refs #248.

## 2026-09-25 · reworded · brought onto the marker convention (#614)
- **Reason:** split out of the withheld-workflow section as its own marked rule, keyed to the act of
  reproducing preprocessing.
- **Actor:** @missingbulb (owner), approving the restructure in a Claude Code session.
- **Landed:** #614
