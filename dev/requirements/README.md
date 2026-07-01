# Executable requirements — the TLDR extension (UI + server)

This folder is a self-contained methodology for **executable requirements**: a way to drive
development where every requirement is backed by a test that proves it, the suite fails the moment a
requirement is added without a proof, and the *expected* result of each proof is owned by the project
owner — never silently changed by an agent to make a red build go green. It is **cross-tier**: a
product requirement is stated once, with its client-UI proof and (where the real boundary is the
backend) its server proof as sibling leaves.

The shape here — a numbered spec, a strict leaf⇄case bijection, kinds as a pluggable contract,
owner-owned expecteds, snapshots driven through the real code — is the reusable pattern. It is
adapted from [`missingbulb/GoogleCalendarEventCreator` `dev/requirements/`](https://github.com/missingbulb/GoogleCalendarEventCreator/tree/main/dev/requirements);
the portable, project-agnostic write-up of *why* and *how* lives in
[`docs/ui-testing-guideline.md`](../docs/ui-testing-guideline.md).

## The five invariants

1. **Doc-first, red by default.** Adding a leaf to [`requirements.md`](requirements.md) fails the
   build until an executable case claims it. The spec drives the tests, not the other way around.
2. **Every leaf ⇄ exactly one case, of exactly one kind.** Enforced as a strict bijection by
   [`requirements-coverage.test.mjs`](requirements-coverage.test.mjs) — which also checks that every
   discovered kind has a runner that *executes* its cases (a claimed-but-never-run leaf fails), and
   that the set of skipped `tbd` leaves matches a committed allowlist (so a wired leaf can't be
   silently downgraded to unverified).
3. **Kinds are extensible.** A *kind* is one way a requirement can be asserted (a rendered-state
   snapshot, a click behavior, a pure rule). Adding one is a self-contained folder drop — see
   [Adding a kind](#adding-a-kind).
4. **Expected is owner-owned.** The success criterion of every case — a committed image, or a coded
   assertion — is approved by the owner. An agent **may never edit an expected (or weaken an
   assertion) to turn a red requirement green**; on a mismatch it surfaces *actual vs expected* and
   asks. See [The owner-approval contract](#the-owner-approval-contract).
5. **A green build means "claimed", not "fully verified".** The coverage gate proves each leaf is
   verified by the *right kind* of test, not that the chain to a real browser is complete. The gaps
   are deliberate and tracked (the `tbd` leaf `8.1`, and the banner atop `requirements.md`).

## The folder is the kind

Each kind is a **top-level folder** under `dev/requirements/` containing a `kind.mjs` descriptor, a
`cases/` directory, and a test runner. **The folder is the single classifier** — a case's kind is the
directory it lives in, so a case module carries *no* `kind` field. [`shared/kinds.mjs`](shared/kinds.mjs)
auto-discovers every `<kind>/kind.mjs`; [`shared/cases.mjs`](shared/cases.mjs) walks each kind's
`cases/` and tags every case with its folder's `kind`/`dir`/`snapshot`.

The kinds that ship today:

| kind | validates | how the "actual" is produced | expected |
| --- | --- | --- | --- |
| `dom` | a rendered **panel-level** state (what's shown/hidden, the whole surface) | the **real** `sidepanel.mjs` / `options.mjs` run under jsdom + a fake `chrome.*`, then rasterized (satori → resvg) with the real `sidepanel.css` | `dom/cases/<stem>.png` (a committed, pixel-exact image, embedded inline in the gallery) |
| `component` | **one element's** internal appearance, isolated from the panel chrome | the **same** real render as `dom`, then **cropped** to the case's `selector` (e.g. `li.comment`, `.comments`) before rasterizing | `component/cases/<stem>.png` (a committed, pixel-exact crop) |
| `behavior` | a gesture a static snapshot can't show (type → Post, save the denylist) | the same harness, driven through the gesture | coded assertions in the case's `verify()` |
| `logic` | a non-visual UI rule with no pixels of its own (the a11y/HTML contract, manifest surfaces) | a shipped predicate/markup | coded assertions in the case's `verify()` |
| `server` | a server-enforced rule behind a UI requirement (only signed-in people can post; the size limit) | the **real** `server/src/handler.mjs` run against a faked event | coded assertions on the response (an error status) |

`dom` and `component` are **snapshot** kinds (their expected is a committed image); `behavior`,
`logic`, and `server` are **coded** kinds (their expected *is* the assertion). The `server` kind is what makes this a
**cross-tier** spec: a requirement like *only signed-in people can post* is stated once, with its UI
half (the client sends the token — `behavior`) **and** its real boundary (the server rejects an
unauthenticated write — `server`) as sibling leaves. [`shared/render/`](shared/render) holds the one
harness the snapshot + behavior cases build on; [`server/`](server) runs the handler for the server
cases (error paths return before any DynamoDB call, so no AWS mock is needed).

### The images are the approval surface — driven by the real code

The point of a requirements gallery is that the owner **sees and approves the rendered UI**. Each
`dom` leaf embeds a real **PNG of that state** in the two-column table, rendered by
[`shared/render/image-renderer.mjs`](shared/render/image-renderer.mjs): the harness builds the panel's
**real** DOM, the real `sidepanel.css` is folded onto it, and satori → resvg rasterize it
deterministically with a bundled font. So the image tracks the shipped code — change a view or a style
and the image moves — and the comparison is pixel-exact (`pixelmatch`, `MAX_DIFF_RATIO = 0`).

satori is not a browser, so the renderer handles what its static model omits: it resolves
`var(--…)` from `:root`, expands the `font:` shorthand, drops the dark-mode `@media` block (rendering
the default light theme), removes `[hidden]` elements (Chrome's UA `display:none`, which satori lacks),
and projects a `textarea`'s `.value` into the image (e.g. the options page's seeded denylist, one host
per line). It cannot show an OS cursor or a `:hover` state — those aren't static DOM; a "clickable"
affordance is covered by its resting visual cue here plus a `behavior` click test, never a faked
cursor. See the "Rendering HTML" section of [the portable guideline](../docs/ui-testing-guideline.md).

## Component (cropped-element) snapshots — pin one element, not the whole panel

`dom` rasterizes the **whole** side panel. `component` rasterizes the **same** panel, rendered by the
**same** real code, then **cropped** to the one element a case's `selector` names (`li.comment`,
`.comments`, …). Everything else is identical: pixel-exact comparison (`MAX_DIFF_RATIO = 0`), a
committed owner-approved PNG, driven through the shipped `sidepanel.mjs` + real `sidepanel.css` — never
a re-implementation. The two kinds share one runner and one renderer; a crop is only a different root
element (`renderComponentImage` in [`shared/render/image-renderer.mjs`](shared/render/image-renderer.mjs)).

**Why crop.** A requirement about *one element's internal appearance* (a comment's byline, its time
meta, its upvote rail) shouldn't ride the panel's chrome. When every such leaf pinned a **full-panel**
image, a cross-cutting change — the header title, the composer copy, the Post button — re-rendered and
forced re-approval of **all** of them, though the tested requirement didn't move. That's noisy diffs
and a diluted approval surface: a reviewer can't separate "the thing this leaf tests changed" from
"some unrelated pixel shifted". A crop is **byte-identical** across any change *outside* the cropped
element, so a leaf's golden moves **only** when the thing it actually pins moves. (Worked proof: the §9
upvote change re-approved 9 full-panel goldens; after this split, a header-title tweak touches the
`dom` panel images and leaves every `component` crop untouched.)

**When to use which.**
- **`component`** — the leaf is about a single element's *internal* appearance, wherever it sits: a
  comment row (`1.3`, `1.5`, `1.6`), its time meta (`4.1`–`4.5`), its upvote rail (`9.1`–`9.3`). Crop
  to that element.
- **`dom`** — the leaf is about a *panel-level state*: what's shown vs hidden, the composer/Post
  enabled state, an empty/error status, the whole surface's layout (`1.1`, `1.2`, `1.4`, `2.1`–`2.3`,
  `6.1`). Render the whole panel.

Rule of thumb: **if the requirement names an element, crop to it; if it names the panel's state, render
the panel.**

**Adding one.** Exactly like a `dom` case (below), under `component/cases/`, plus one field: `selector`
— the element to crop (the first match). The crop renders at the panel's content width, so text wraps
exactly as it does in the panel. Fidelity caveat: satori can't cascade from an ancestor the crop
excludes, so the renderer folds `<body>`'s inherited font/colour onto the crop root; a style set by an
*excluded ancestor other than `<body>`* isn't modelled (none is, today).

**Further crop candidates** (noted, not migrated — migrate a leaf to a crop when a real cross-cutting
change would otherwise churn its image for nothing):
- **the composer** (`.composer`) — the textarea prompt + Post button; today its look rides the
  full-panel empty-state `1.2`, so it re-approves on any header/status change.
- **the Post button states** (`.post`, enabled vs `:disabled`) — only incidental in the
  posting/saved full-panel images today.
- **the status line** (`.status`) — the "TLDR is off" / "No notes yet" / "Couldn't load notes." copy,
  independent of the rest of the panel.
- **the options editor** (`form` on the options page, `6.1`) — heading + helper + seeded textarea +
  Save, independent of the page shell.

## Adding a requirement (an existing kind)

1. Add the leaf number + a two-column row to [`requirements.md`](requirements.md), with a left-cell
   `<!-- req-gallery:<id> -->` marker. The build is now **red** (no case claims it).
2. Add its one case under `<kind>/cases/`, named `<slug>.<id>.case.mjs` — `<slug>` is the section's
   component/feature name, `<id>` the dotted number (e.g. `notes-list.1.3.case.mjs`). The case
   supplies only the fake inputs (a `dom` case) or a `verify()` (a coded case); it does **not**
   declare a kind.
3. Provide the expected: `npm run refresh:ui` to render the image for a `dom` case (then have the
   owner approve the pixels), or write the `verify()` assertions for a coded case. The build goes
   **green** when the leaf is both claimed and passing.

## Adding a kind

Nothing in the loader, the coverage gate, or the gallery needs editing — they all iterate the
registry:

1. `mkdir dev/requirements/<kind>/cases`.
2. Add `dev/requirements/<kind>/kind.mjs`: `export default { snapshot: <bool> }` (`true` if the
   expected is a committed artifact file the runner renders & compares; `false` for a coded
   assertion).
3. Add `dev/requirements/<kind>/<kind>.test.mjs` — the runner that produces the *actual* for each of
   its cases and compares to the *expected*. (For a snapshot kind, also add a producer to
   [`shared/render/render-snapshot.mjs`](shared/render/render-snapshot.mjs).)
4. Add the requirement leaf(s) + a case under `<kind>/cases/`. The `test` script already globs
   `dev/requirements/**/*.test.mjs`, so the new runner is picked up automatically.

A `tbd` case (`tbd: true` + a `coveredBy` pointer) is a tracked-but-not-wired-here leaf: it stays a
visible requirement, reported skipped, naming where it's covered today. Because `tbd` skips
verification, adding one is a **reviewed change**: update the `TBD_LEAVES` allowlist in
[`requirements-coverage.test.mjs`](requirements-coverage.test.mjs) in the same commit, or the gate
fails. Prefer a real verification; reach for `tbd` only for a genuinely not-yet-wired layer (e.g. the
real-browser e2e, `8.1`).

## The owner-approval contract

The *expected* of every requirement is owned by the project owner, in two honest shapes:

- **Artifact-expected** (`dom` image): the owner approves a committed **PNG**. An agent may
  *propose* a new image for a brand-new leaf, but must **never modify a committed image** to make a
  failing test pass.
- **Coded-expected** (`behavior`, `logic`): the expected *is* the assertion in the case's `verify()`.

Either way the rule is one sentence: **on an actual↔expected mismatch, surface *actual*, *expected*,
and the *diff*, and ask the owner to approve or reject — never edit the success criterion to go
green.** On a `dom` mismatch the runner writes the freshly-rendered `actual` + a `diff` to
`shared/.artifacts/` and points at them; regenerate with `npm run refresh:ui` only once the change is
understood and approved, and keep the *reverted* image committed until then so the branch honestly
shows the test red-pending.

## Determinism

- **Pinned clock.** The panel formats a note's age against the wall clock. The harness pins
  `Date.now()` to [`shared/reference-time.mjs`](shared/reference-time.mjs) while it drives the real
  code, so an image authored today doesn't rot tomorrow.
- **Pinned locale/timezone.** Older notes show an absolute locale date; the `test`/`test:ui`/
  `refresh:ui` scripts pin `LANG=C.UTF-8` and `TZ=UTC`, and both the dom and logic runners guard them
  with an actionable message (the shared [`shared/locale-guard.mjs`](shared/locale-guard.mjs)).
- **No real I/O.** Every `chrome.*`/`fetch` is faked and resolves synchronously, so the harness
  settles a finite microtask chain rather than racing a network.

## Layout

```
dev/requirements/
  requirements.md                 the numbered, executable spec (the contract) + the two-column gallery
  requirements-coverage.test.mjs  the leaf⇄case bijection + kind-routing gate
  README.md                       this guide

  shared/                         cross-kind infrastructure
    kinds.mjs                     the kind registry (auto-discovers <kind>/kind.mjs)
    cases.mjs                     loads every kind's cases/, tagging kind from the folder
    requirements-doc.mjs          parses requirements.md into leaf ids
    reference-time.mjs            the pinned "now"
    locale-guard.mjs              the shared en-US/UTC environment guard (dom + logic runners)
    build-gallery.mjs + gallery.test.mjs   the two-column gallery generator + its gate
    artifacts-dir.mjs             where a failed dom diff writes its actual
    render/                       the one harness both snapshot + behavior cases use
      harness.mjs                 drives the real sidepanel.mjs/options.mjs under jsdom + fake-chrome
      fake-chrome.mjs             the fake chrome.* surface (incl. a real, decodable OAuth token)
      image-renderer.mjs          the real DOM + real sidepanel.css -> satori -> resvg -> PNG
      fonts/                      the bundled font (deterministic rasterization) + its LICENSE
      render-snapshot.mjs         kind -> produce a case's PNG
      dom-snapshots.test.mjs      the dom snapshot runner — pixel comparison (npm run test:ui)
      refresh-snapshots.mjs       regenerate images + gallery (npm run refresh:ui)

  dom/       kind.mjs  cases/<slug>.<id>.case.mjs (+ <stem>.png)          # whole-panel snapshot
  component/ kind.mjs  cases/<slug>.<id>.case.mjs (+ <stem>.png)          # cropped-element snapshot (shares the dom runner)
  behavior/  kind.mjs  behavior.test.mjs  cases/<slug>.<id>.case.mjs
  logic/     kind.mjs  logic.test.mjs     cases/<slug>.<id>.case.mjs
  server/    kind.mjs  server.test.mjs  handler-harness.mjs  cases/<slug>.<id>.case.mjs
```

## Commands

Run from the `dev/` package (`npm --prefix dev …` from the repo root):

- `npm test` — the whole executable-requirements suite (UI + server).
- `npm run test:ui` — just the dom (image) snapshot lane.
- `npm run refresh:ui` — regenerate the `dom` images + the inline gallery after an **intentional**
  panel/options/HTML change, then review the diff and get it approved.

## Honesty caveat

A green build means every leaf is **claimed** by a case of the right kind, **not** that every leaf is
*faithfully* verified end to end. The `dom`/`behavior` cases run the real UI modules under a **fake
Chrome**, so they pin what our code *does*, not that a real Chrome paints it — only the `tbd` `8.1`
e2e would. This gap is deliberate and tracked (see the banner in `requirements.md`).
