# Executable requirements — the TLDR extension UI

This folder is a self-contained methodology for **executable requirements**: a way to drive UI
development where every requirement is backed by a test that proves it, the suite fails the moment a
requirement is added without a proof, and the *expected* result of each proof is owned by the project
owner — never silently changed by an agent to make a red build go green.

The shape here — a numbered spec, a strict leaf⇄case bijection, kinds as a pluggable contract,
owner-owned expecteds, snapshots driven through the real code — is the reusable pattern. It is
adapted from [`missingbulb/GoogleCalendarEventCreator` `dev/requirements/`](https://github.com/missingbulb/GoogleCalendarEventCreator/tree/main/dev/requirements);
the portable, project-agnostic write-up of *why* and *how* lives in
[`docs/ui-testing-guideline.md`](../../../docs/ui-testing-guideline.md).

## The five invariants

1. **Doc-first, red by default.** Adding a leaf to [`requirements.md`](requirements.md) fails the
   build until an executable case claims it. The spec drives the tests, not the other way around.
2. **Every leaf ⇄ exactly one case, of exactly one kind.** Enforced as a strict bijection by
   [`requirements-coverage.test.mjs`](requirements-coverage.test.mjs).
3. **Kinds are extensible.** A *kind* is one way a requirement can be asserted (a rendered-state
   snapshot, a click behavior, a pure rule). Adding one is a self-contained folder drop — see
   [Adding a kind](#adding-a-kind).
4. **Expected is owner-owned.** The success criterion of every case — a committed golden, or a coded
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
| `dom` | a rendered side-panel / options state | the **real** `sidepanel.mjs` / `options.mjs` run under jsdom + a fake `chrome.*`, serialized to a DOM tree | `dom/cases/<stem>.golden.txt` (a committed, reviewable text golden) |
| `behavior` | a gesture a static snapshot can't show (type → Post, save the denylist) | the same harness, driven through the gesture | coded assertions in the case's `verify()` |
| `logic` | a non-visual rule (time formatting, the a11y/HTML contract, manifest surfaces) | a shipped predicate/markup, or the real render for a private formatter | coded assertions in the case's `verify()` |

`dom` is a **snapshot** kind (its expected is a committed file); `behavior` and `logic` are **coded**
kinds (their expected *is* the assertion). [`shared/render/`](shared/render) holds the one harness
both snapshot and behavior cases build on.

### Why text goldens, not pixels

The panel's requirements are about **structure, copy, and semantics** — which element, which
class/state, which `aria` role, what text — not sub-pixel layout. A serialized DOM tree
([`shared/render/serialize-dom.mjs`](shared/render/serialize-dom.mjs)) captures exactly those, stays
readable in a PR diff (the owner can eyeball what changed), needs no rendering engine or binary
artifacts, and still tracks the shipped code (it's produced by running the real modules). When a
project genuinely needs pixel fidelity, a pixel-snapshot kind is a separate, heavier addition — see
the "rendering HTML" section of [the portable guideline](../../../docs/ui-testing-guideline.md).

## Adding a requirement (an existing kind)

1. Add the leaf number + a two-column row to [`requirements.md`](requirements.md), with a left-cell
   `<!-- req-gallery:<id> -->` marker. The build is now **red** (no case claims it).
2. Add its one case under `<kind>/cases/`, named `<slug>.<id>.case.mjs` — `<slug>` is the section's
   component/feature name, `<id>` the dotted number (e.g. `notes-list.1.3.case.mjs`). The case
   supplies only the fake inputs (a `dom` case) or a `verify()` (a coded case); it does **not**
   declare a kind.
3. Provide the expected: `npm run refresh:ui` to render the golden for a `dom` case (then have the
   owner approve it), or write the `verify()` assertions for a coded case. The build goes **green**
   when the leaf is both claimed and passing.

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
visible requirement, reported skipped, naming where it's covered today. Prefer a real verification;
reach for `tbd` only for a genuinely not-yet-wired layer (e.g. the real-browser e2e, `8.1`).

## The owner-approval contract

The *expected* of every requirement is owned by the project owner, in two honest shapes:

- **Artifact-expected** (`dom` golden): the owner approves a committed **file**. An agent may
  *propose* a new golden for a brand-new leaf, but must **never modify a committed golden** to make a
  failing test pass.
- **Coded-expected** (`behavior`, `logic`): the expected *is* the assertion in the case's `verify()`.

Either way the rule is one sentence: **on an actual↔expected mismatch, surface *actual*, *expected*,
and the *diff*, and ask the owner to approve or reject — never edit the success criterion to go
green.** On a `dom` mismatch the runner writes the freshly-rendered actual to
`shared/.artifacts/<name>.actual.txt` and points at it; regenerate with `npm run refresh:ui` only
once the change is understood and approved, and keep the *reverted* golden committed until then so the
branch honestly shows the test red-pending.

## Determinism

- **Pinned clock.** The panel formats a note's age against the wall clock. The harness pins
  `Date.now()` to [`shared/reference-time.mjs`](shared/reference-time.mjs) while it drives the real
  code, so a golden authored today doesn't rot tomorrow.
- **Pinned locale/timezone.** Older notes show an absolute locale date; the `test`/`test:ui`/
  `refresh:ui` scripts pin `LANG=C.UTF-8` and `TZ=UTC`, and the dom runner guards both with an
  actionable message.
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
    build-gallery.mjs + gallery.test.mjs   the two-column gallery generator + its gate
    artifacts-dir.mjs             where a failed dom diff writes its actual
    render/                       the one harness both snapshot + behavior cases use
      harness.mjs                 drives the real sidepanel.mjs/options.mjs under jsdom + fake-chrome
      fake-chrome.mjs             the fake chrome.* surface (incl. a real, decodable OAuth token)
      serialize-dom.mjs           normalized DOM -> golden text
      render-snapshot.mjs         kind -> produce a case's golden
      note-meta.mjs               §4 helper: render one note, read its meta line
      dom-snapshots.test.mjs      the dom snapshot runner (npm run test:ui)
      refresh-snapshots.mjs       regenerate goldens + gallery (npm run refresh:ui)

  dom/       kind.mjs  cases/<slug>.<id>.case.mjs (+ <stem>.golden.txt)
  behavior/  kind.mjs  behavior.test.mjs  cases/<slug>.<id>.case.mjs
  logic/     kind.mjs  logic.test.mjs     cases/<slug>.<id>.case.mjs
```

## Commands

- `npm test` — the whole client suite, including this lane (`client/` working dir).
- `npm run test:ui` — just the executable-requirements suite.
- `npm run refresh:ui` — regenerate the `dom` goldens + the inline gallery after an **intentional**
  panel/options/HTML change, then review the diff and get it approved.

## Honesty caveat

A green build means every leaf is **claimed** by a case of the right kind, **not** that every leaf is
*faithfully* verified end to end. The `dom`/`behavior` cases run the real UI modules under a **fake
Chrome**, so they pin what our code *does*, not that a real Chrome paints it — only the `tbd` `8.1`
e2e would. This gap is deliberate and tracked (see the banner in `requirements.md`).
