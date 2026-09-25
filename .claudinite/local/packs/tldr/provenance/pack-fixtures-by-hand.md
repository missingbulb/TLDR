## 2026-08-01 · born · Claudinite growth: extract lessons (#168)
- **Source:** verified while landing #162's `tldr/comment-class-menu`: no npm script globs
  `.claudinite/local/packs/**` (root `npm test` covers `shared/test/` and `dev/build/tools/test/`;
  `test:all`'s sub-suites cover `extension-test/`, `server/test/` and `dev/requirements/`), and the
  conformance workflow's world sweep loads rule modules without executing a fixture or any `scope:
  'work'` rule.
- **Reason:** a green `npm run test:all` would otherwise be read as covering this pack's checks.
- **Actor:** the growth-extract run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a `##` section in RULES.md with the fixture invocation fenced; prose because it is
  a verification judgment, not a static signature.
- **Retire when:** an npm script or CI job runs `.claudinite/local/packs/**` fixtures.
- **Landed:** #168, Refs #165.

## 2026-09-25 · reworded · brought onto the marker convention (#614)
- **Reason:** the `##` section became one marked rule keyed to touching a rule here; the per-suite
  coverage inventory moved to this file, the fenced invocation kept.
- **Actor:** @missingbulb (owner), approving the restructure in a Claude Code session.
- **Landed:** #614
