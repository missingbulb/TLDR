## 2026-08-17 · born · Claudinite growth: extract lessons (#288)
- **Source:** #251 and #262 each blew the MCP token cap on the first `list_workflow_runs` call;
  probed then with `per_page: 3` against `chrome-extension-release.yml` (93 runs), which still
  returned a page of 30, ~410KB.
- **Reason:** go straight to the saved overflow file rather than retrying smaller.
- **Actor:** the growth-extract run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a `##` section in RULES.md, prose because it is a harness-tool behavior.
- **Rejected:** landing #251's `total_count: 0` reading as a trap - re-tested, the daily-release
  workflow is `workflow_call`-only with no runs of its own, so it went in as the rule's exception
  instead.
- **Landed:** #288, Refs #271.

## 2026-09-20 · reworded · the general finding left to the canon (#515)
- **Reason:** the git-github pack's `git-github-advanced` skill now carries "`list_workflow_runs`
  can ignore `per_page`" and its remedy; the residue kept was this repo's per-run byte size and the
  `total_count: 0` exception.
- **Actor:** the growth-dedup run, merged by @missingbulb (owner).
- **Landed:** #515, Refs #507.

## 2026-09-20 · reworded · perPage is honored (#580)
- **Source:** probed live against `chrome-extension-release.yml` (125 runs): `perPage: 3` returned
  exactly 3 runs, each ~2.7KB with no `repository`/`head_repository` sub-object; the unset default
  page of 30 still overran the cap (70,827 characters); `perPage: 1` on the two reusables
  reconfirmed `total_count: 0`.
- **Reason:** the "ignores `per_page`" claim was stale; the remedy became an explicit low `perPage`.
- **Actor:** the rule-revalidation run, merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Retire when:** the default page of this repo's release workflows fits under the MCP result cap.
- **Landed:** #580, Refs #572.

## 2026-09-25 · reworded · brought onto the marker convention (#614)
- **Reason:** the `##` section became one marked rule keyed to the call; the run counts and per-run
  byte size moved to this file.
- **Actor:** @missingbulb (owner), approving the restructure in a Claude Code session.
- **Landed:** #614
