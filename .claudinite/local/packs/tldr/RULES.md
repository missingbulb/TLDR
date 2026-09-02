# TLDR — repo rules

## A green release run is not evidence the store publish works

The daily auto-release short-circuits at `daily / check` when nothing under the release config's
`ship_paths` changed since the last release tag, so `Release to Chrome Store` concludes **success**
with the `daily / publish` job skipped entirely, and the daily leg only runs when the Claudinite
scheduler dispatches this workflow in `mode: daily` — so a real publish is rarer still, and most
green runs never touched the store.

When triaging a publish-leg failure, read the **`daily / publish` job**, not the run conclusion. (1)

- **`ITEM_NOT_UPDATABLE` is Chrome Web Store-side state** — a prior submission still pending review
  or ready to publish — so **nothing in `main` can be "the fix"**, and no repo-side defect that
  happened to be open at the time (a stale secret, a half-landed config) should be credited with it.
- **The only closing evidence is a run that actually reaches `daily / publish` and goes green**, or
  the Chrome Developer Dashboard showing the item out of pending/review. Absent that, the issue stays
  open — resolving the co-occurring repo bug is not the same as verifying the publish path.

## This repo's copy of the bump-version workflow is deliberately not the canon stub

The canon line for a vendored file — *never hand-edit these copies, the template is canon* —
does **not** hold for whichever workflow carries the repo's one local delta: a step that aligns
the repo-root `package.json` to a version the pipeline just bumped, load-bearing since the
release config only bumps `manifest_path` and `package_json_path`. `chrome-release-vendoring`'s
materialize is an unconditional verbatim overwrite with no per-repo exemption seam, so the step
is fragile in a specific, repeating way; `tldr/release-root-version-align` reds if it goes
missing. (2)

The only automated, unattended version-write left is the deliberate minor/major dispatch,
`.github/workflows/chrome-extension-bump-version.yml` — **that** is now the file carrying the
align step and the one `tldr/release-root-version-align` watches.
`chrome-extension-daily-release.yml` is back to a pure, un-diverged stub copy. (3)

So when baselining §2b hands you a withheld workflow file, check which one carries the align step
**now** (`tldr/release-root-version-align`'s own `WORKFLOW` constant is the source of truth) —
**diff that one against its stub and land the union, never the stub; every other withheld file is
a plain copy.**

Reproducing what preprocessing wanted to write takes the **full canon clone**, not this repo's
mount: `node .claudinite/shared/engine/migrations/apply.mjs` writes nothing here, because the
`chrome-release-vendoring` record has aged out of the vendored subset. Clone
`missingbulb/Claudinite` shallow and run *its* `apply.mjs` with `CLAUDE_PROJECT_DIR` and
`CLAUDINITE_CAN_WITHHOLD_WORKFLOWS=1` pointed at a worktree of `main`.

## `npm run test:all` chains four sub-suites

`test:all` is `npm test && npm --prefix server ci && npm --prefix server test && npm --prefix
extension test && npm --prefix dev ci && npm --prefix dev test` — six commands, four sub-suites
(root, `server`, `extension`, `dev/requirements`):

```
npm run test:all > /tmp/test-all.log 2>&1
echo "exit: $?"; grep -E '^# (pass|fail)|failing' /tmp/test-all.log
```

## `actions_list list_workflow_runs` ignores `per_page` for this repo's busiest workflows

Confirmed directly: `per_page: 3` against `chrome-extension-release.yml` (93 runs) still returns the
tool's default page of 30 — `per_page` has no effect on this method. Each run object embeds full
`repository`/`head_repository`/`head_commit` sub-objects (~14KB per run), so 30 of them is ~410KB,
which blows the MCP result token cap on the **first** call, every time, for this repo's release and
daily-release workflows. Shrinking `per_page` and retrying wastes a call for nothing — go straight
to reading the tool's own saved raw-JSON overflow file (the error message names the path) and
filter it with `python`/`jq`. (A `total_count: 0` for `chrome-extension-daily-release.yml` or
`chrome-extension-publish-store.yml` is **not** this bug — they're `workflow_call`-only reusable
workflows with no runs of their own, so that result is correct, not a trap.)

## Parallel background agents reading conversation logs need their own scratch filename

`growth-extract`'s conversation half can dispatch several background subagents at once, one per
`conversation-logs` file. Subagents share the parent session's scratchpad directory, so if each is
told (or defaults to) the same generic output path — `.../scratchpad/log.jsonl` — their concurrent
`git show origin/conversation-logs:<file> > .../scratchpad/log.jsonl` writes collide: one agent's
write can land mid-read by another, producing a truncated or mixed-content file with no error. Give
each subagent's dump a name that can't collide — the log's own filename, or the subagent's own
session id — never the bare `log.jsonl` default. (4)

## Nothing in CI runs this pack's fixtures — invoke them by hand

No npm script globs `.claudinite/local/packs/**`. Root `npm test` covers `shared/test/` and
`dev/build/tools/test/`; the three sub-suites `test:all` chains cover `extension-test/`,
`server/test/` and `dev/requirements/`. `claudinite-conformance.yml` runs
`check_the_world.mjs`, which *loads* every rule module (so a broken import surfaces) but never
executes a fixture — and never runs a `scope: 'work'` rule at all, which is what this pack's checks
are.

So a green `npm run test:all` says nothing about a rule in here. Run its fixture directly when you
touch one:

```
node --test .claudinite/local/packs/tldr/comment-class-menu.test.mjs
```

## `issue_read`'s `get_labels` (and its other `get_*` methods) reject a PR number

`mcp__github__issue_read` resolves only true issues and errors "Could not resolve to an Issue with
the number of N" when N is actually a PR — resolve a PR's labels or metadata via
`mcp__github__pull_request_read` (or `search_pull_requests`) instead.

## Grep this repo's local-pack `RULES.md` before reverse-engineering from engine source

This file is injected wholesale into every session's context via `CLAUDE.md`, so a repo-specific
mechanism (a withheld workflow, a pagination quirk) is often already documented here — grep it for
the phenomenon's keywords before tracing engine source to rediscover what's already in front of you.

## A pack carries how we work — never what the product does

A pack rule states how we work, not what the product does: the category taxonomy's
presentation-lockstep contract — every id in `shared/categories.mjs` carrying its design
descriptor, scoped stylesheet, registry entry and `sidepanel.html` link — belongs in the
executable spec (`dev/requirements/`) and the extension's own suite, never a pack rule;
encoding it as a pack rule splits one feature's definition across two systems and lands it where
no test of the product ever reads. (5)
