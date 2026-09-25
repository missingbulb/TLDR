# TLDR — repo rules

- **Triaging a publish-leg failure of `Release to Chrome Store`** — read the **`daily / publish`
  job**, not the run conclusion: `daily / check` short-circuits when the manifest's version already
  has a `v$version` release/tag, concluding **success** with `daily / publish` skipped, and the
  daily leg runs only when the Claudinite scheduler dispatches `mode: daily`, so most green runs
  never touched the store. (green-run-not-publish)

- **Seeing `ITEM_NOT_UPDATABLE` from the publish leg** — it is Chrome Web Store-side state, a
  prior submission still pending review or ready to publish, so **nothing in `main` can be "the
  fix"**, and no repo-side defect that happened to be open at the time (a stale secret, a
  half-landed config) should be credited with it. (itemnotupdatable-chrome-web)

- **Closing a publish-leg failure** — the only closing evidence is a run that actually reaches
  `daily / publish` and goes green, or the Chrome Developer Dashboard showing the item out of
  pending/review; absent that the issue stays open, since resolving the co-occurring repo bug is not
  verifying the publish path. (only-closing-evidence)

- **Baselining §2b hands you a withheld workflow file** — the one carrying the repo-root
  `package.json` align step (the file `tldr/release-root-version-align`'s `WORKFLOW` constant names,
  now `.github/workflows/chrome-extension-bump-version.yml`, and the check reds if the step goes
  missing) is deliberately not the canon stub, so the canon's *never hand-edit these copies* does
  **not** hold for it: diff it against its stub and land the union, never the stub; every other
  withheld file is a plain copy. (withheld-workflow-union)

- **Reproducing what preprocessing wanted to write** — use a shallow clone of
  `missingbulb/Claudinite` and run *its* `apply.mjs` with `CLAUDE_PROJECT_DIR` and
  `CLAUDINITE_CAN_WITHHOLD_WORKFLOWS=1` pointed at a worktree of `main`; this repo's
  `node .claudinite/shared/engine/migrations/apply.mjs` writes nothing, because the
  `chrome-release-vendoring` record has aged out of the vendored subset. (canon-clone-apply)

- **Running `npm run test:all`** — it is `npm test && npm --prefix server ci && npm --prefix
  server test && npm --prefix extension test && npm --prefix dev ci && npm --prefix dev test`, six
  commands over four sub-suites (root, `server`, `extension`, `dev/requirements`); capture and read
  it with:

  ```
  npm run test:all > /tmp/test-all.log 2>&1
  echo "exit: $?"; grep -E '^# (pass|fail)|failing' /tmp/test-all.log
  ```

  (test-all-sub-suites)

- **Touching a rule in this pack** — run its fixture by hand, because nothing in CI does: no npm
  script globs `.claudinite/local/packs/**`, so a green `npm run test:all` says nothing about it,
  and `claudinite-conformance.yml`'s `check_the_world.mjs` only loads rule modules, never executing
  a fixture or a `scope: 'work'` rule, which is what this pack's checks are:

  ```
  node --test .claudinite/local/packs/tldr/comment-class-menu.test.mjs
  ```

  (pack-fixtures-by-hand)

- **Listing runs of `chrome-extension-release.yml` or this repo's other release workflows with
  `actions_list list_workflow_runs`** — pass an explicit low `perPage` (it is honored, not
  ignored), since the default 30-run page overruns the MCP result token cap; a `total_count: 0` for
  `chrome-extension-daily-release.yml` or `chrome-extension-publish-store.yml` is correct, not this
  trap, as they are `workflow_call`-only reusables with no runs of their own.
  (list-workflow-runs-perpage)

- **About to trace engine source to explain a repo-specific mechanism** (a withheld workflow, a
  pagination quirk) — grep this `RULES.md` for the phenomenon's keywords first: it is injected
  wholesale into every session via `CLAUDE.md`, so the answer is often already in front of you.
  (grep-local-rules-first)

- **Wanting a pack rule for what the product does** — such as the category taxonomy's
  presentation-lockstep contract, every id in `shared/categories.mjs` carrying its design
  descriptor, scoped stylesheet, registry entry and `sidepanel.html` link — put it in the
  executable spec (`dev/requirements/`) and the extension's own suite, never a pack rule: that
  splits one feature's definition across two systems and lands it where no test of the product
  ever reads. (pack-how-not-what)
