# UI testing with executable requirements — a portable guideline

A field guide for testing a UI the way this repo tests the extension's side panel and options page:
as **executable requirements**. It is **project-agnostic** — the principles hold for a Chrome
extension popup, a web app, a mobile screen, a CLI's rendered output. The point is the *practice of
UI testing*, not any one rendering technology; HTML rendering is one section near the end, not the
spine.

Two worked examples to read alongside it: this repo's
[`dev/requirements/`](../requirements/README.md), and the project it adapts,
[`missingbulb/GoogleCalendarEventCreator` `dev/requirements/`](https://github.com/missingbulb/GoogleCalendarEventCreator/tree/main/dev/requirements).
The durable, cross-project testing lessons these build on live in the team corpus (`testingPractices.md`).

---

## 1. The problem this solves

Most UI test suites fail in one of a few predictable ways:

- **They rot.** A snapshot authored today goes red next week because the clock, locale, or timezone
  moved — not because the UI changed. People stop trusting it and regenerate baselines on autopilot.
- **They fake the very thing under test.** A test that stubs the exact boundary where the behavior
  lives (the tab actually opening, the element actually rendering) can only confirm the shape it
  asserts, never the runtime effect.
- **They drift from the product.** A hand-authored "expected" that mirrors what production *should*
  render is a parallel implementation; it diverges silently and can even encode a state the app never
  shows.
- **Nobody reads them for intent.** Unit tests assert mechanics; no one opens them to learn what the
  UI is *supposed* to do, so requirements live only in someone's head.
- **One mechanism is forced onto everything.** A pixel-snapshot gate is made to "cover" a click it
  can never observe, or a state its fixture can't reach — so the gate is green while the behavior is
  unverified.

Executable requirements attack all five at once.

## 2. The core idea

> A **numbered specification** of what the UI must do, where **every leaf requirement is claimed by
> exactly one executable case**, of exactly one **kind** of verification, whose **expected result is
> owned by a human** and whose **actual is produced by the real code**. Adding a requirement fails
> the build until a case proves it.

Five moving parts:

1. **A spec that is the source of truth** — numbered leaves, each a single testable statement.
2. **A bijection gate** — every leaf has exactly one case; every case names a real leaf. A new
   requirement with no case is red; a stray case is red.
3. **Kinds** — each leaf is verified by the *one mechanism it actually needs* (a render snapshot, a
   gesture/behavior test, a pure-logic assertion, an end-to-end run).
4. **Owner-owned expecteds** — the success criterion (a committed golden, a coded assertion) is
   approved by a human and never silently rewritten to go green.
5. **Real-code actuals** — the "actual" is produced by running the shipped UI code against faked
   *inputs*, never by a parallel re-implementation.

## 3. What to focus on (the principles)

These are the load-bearing ideas. Get these right and the file layout is a detail.

### 3.1 Doc-first, red by default
The spec drives the tests. Adding a leaf to the spec makes the build red until a case claims it — so
the requirement can't be "documented" without being proven, and can't quietly lose its proof. A
strict leaf⇄case bijection (one case per leaf, one leaf per case) is what makes "is everything
covered?" a build result, not a code review hope.

### 3.2 Segment by the verification each requirement needs
This is the most important and most-violated principle. **A requirement should be routed to the kind
of test that can actually observe it.** A static image cannot see a tab open or a popup close; a
click test has no pixels; a pure-logic assertion can't tell you whether the layout overflowed. When a
coverage gate forces every leaf onto one mechanism, it green-lights claims that mechanism can't check
— a snapshot "covering" a navigation it never performs, or a state its fixture can't reach. Make
**kind** a first-class concept: classify each leaf by how it's verified, and let the gate enforce
that a behavior leaf carries no snapshot and a render leaf isn't faked by a logic stub. (In the
worked examples a leaf's kind *is the folder it lives in* — one classifier, nothing to drift.)

### 3.3 Drive the real code path; fake only inputs
The "actual" must come from the shipped UI code — the real render function, the real event handlers —
fed faked *inputs* (a faked data response, a faked platform API, a faked clock). Never hand-maintain
a copy of the markup or re-derive the expected string in the test: that's a parallel implementation
that drifts and can't catch a change to the real renderer. The tell that you've got this right: you
change a copy string or a class in the production component and a snapshot moves on its own.

### 3.4 Owner-owned expecteds; never re-baseline to go green
The expected result of each case — a committed golden file or a coded assertion — is a human's
approved decision. When a snapshot legitimately moves, **do not quietly regenerate the baseline**: an
unreviewed baseline change is an unreviewed behavior change. Surface the committed **expected**, the
newly-rendered **actual**, and the **diff**; get approval; only then re-baseline. Until then keep the
*reverted* baseline committed so the branch honestly shows the test red-pending. An automated agent's
write surface should exclude the expected (and the runner) so it *can't* weaken the criterion.

### 3.5 Determinism: pin the clock, locale, and timezone; do no real I/O
Anything time-, locale-, or timezone-dependent in the rendered output will rot a fixed fixture. Pin a
**reference instant** and thread it through the code under test (or, if the formatter reads the clock
directly and you can't thread it, pin `Date.now()` in the test harness around the render). Pin the
**locale** and **timezone** for any formatted date, and guard them with an actionable message so a
maintainer on a different shell gets "set TZ=UTC" rather than a baffling text diff. Fake every network
/ platform call so it resolves synchronously — then the test *settles a finite task queue* instead of
racing real I/O, which is both deterministic and fast. When you retrofit a clock-dependent rule, pick
the reference instant so existing fixtures land on the side they were authored for, keeping the diff
small.

### 3.6 Make the UI driveable (without rewriting it)
To run the real UI in a test you need a **fake platform surface** (a fake `chrome.*`, a fake router, a
fake storage) faithful where behavior depends on it and a no-op where it doesn't. If the component is
a pure `render(state)` you call it directly; if it's a self-running module that wires itself to the
platform on load (as our side panel is), load it under a DOM (e.g. jsdom) with the fakes installed and
drive it through its real events. Either way, restore every global you swap, and **settle the
component's async before tearing down** — a handler that resumes after teardown and touches a
restored-to-undefined global is a self-inflicted flake. Prefer driving the real wiring (dispatch a
real submit) over poking internals: it tests more and couples less.

### 3.7 Accessibility and security are UI requirements, not extras
"The notes list announces new items" (`aria-live`), "the error is announced" (`role="alert"`), "an
untrusted body can't inject an element" (XSS) are exactly as much UI requirements as "the empty state
reads *No notes yet*". Give them leaves. Route an a11y attribute to a coded assertion against the
shipped markup (a golden reviewer can miss a dropped attribute; an assertion fails loudly); route an
injection guard to a behavior case that renders an untrusted input and asserts no element appeared.

### 3.8 Be honest about what's verified
A green build means each leaf is *claimed by the right kind of test* — not that the chain to a real
device is complete. When a layer is faked (a fake browser instead of a real one), **say so**: a loud
banner on the spec, and a tracked `tbd` leaf naming where the faithful verification is still owed.
"Claimed" and "fully verified" are different words on purpose. A test that *can* only run in CI (a
real browser) must also diagnose itself on failure and be hang-proof (bound every `await`), because
each CI-only iteration costs a full round-trip.

### 3.9 One behavior per case, reviewed for intent
Keep each case minimal and representative — one requirement, no incidental complexity — because the
case is what a human reads to understand the requirement. The declarative expected files (goldens) and
the case list double as living documentation that, unlike unit tests, someone actually reads for
*intent*.

## 4. Starting a UI project with this from the get-go

A practical setup recipe — cheaper to do on day one than to retrofit:

1. **Create a `requirements/` (or `dev/requirements/`) area** beside the UI code, with a
   `requirements.md` spec and a coverage test. Number leaves stably; key a case to a leaf by filename
   (`<slug>.<id>.case.*`) so renumbering a section doesn't force a mass rename.
2. **Stand up the bijection gate first**, before any case. It parses the spec's leaf numbers, loads
   the cases, and asserts the one-to-one mapping plus the kind-routing rules. Now the spec is
   enforceable.
3. **Define your kinds by the verifications your UI needs** (see §5). Make the kind a folder, so the
   classifier can't drift from a parallel tag.
4. **Build one harness that runs the real UI** against a fake platform surface and a pinned clock,
   shared by your snapshot and behavior kinds. This is the highest-leverage piece — invest here.
5. **Pick a snapshot representation you'll actually review** (§6). For a requirements/approval doc,
   default to an **inline rendered image** of each state (the owner approves the look); add a
   serialized-DOM text assertion alongside it when you want precise structural diffs.
6. **Wire determinism into the test command** (pin `TZ`, `LANG`/locale), add a refresh script that
   regenerates goldens deterministically and is **skipped in CI** (CI is read-only; it asserts the
   committed truth), and ignore the failure-artifacts directory.
7. **Make `refresh` regenerate the spec's inline gallery too**, so the spec, the cases, and the
   artifacts can't silently disagree.
8. **Add a tbd leaf for the real-device e2e** even if you can't wire it yet — it keeps the honesty
   gap visible.

Then, for each requirement: add the leaf (red) → add the one case → provide the expected (golden or
assertion) → green.

## 5. Choosing kinds for your UI

Kinds are *mechanisms of verification*, not feature areas. A good default set:

| kind | use it for | expected |
| --- | --- | --- |
| **render / dom** | what a state looks like: structure, copy, classes, a11y attributes | a committed snapshot (text or pixels) |
| **behavior** | a gesture's effect a static snapshot can't show: a click navigates, a submit posts optimistically, a save persists | coded assertions over the driven DOM + captured platform calls |
| **logic** | a non-visual rule the UI depends on: a formatter, a state-machine transition, a config/manifest surface | coded assertions against the shipped function/markup |
| **server / backend** | the server-enforced half of a UI requirement: auth, size/rate limits, validation | run the real handler against a faked request, assert its response (an error is easiest) |
| **e2e** (often a singleton, frequently `tbd`) | "it actually loads and runs on the real platform" | a real-browser/device run, self-diagnosing and hang-proof |

A *singleton* kind is fine: "the app loads in a real browser" is a perfectly good requirement whose
mechanism is one heavy test. The kind names the mechanism, not a plurality. Add a kind only when a new
requirement genuinely needs a *different way of asserting* — and make adding one a self-contained
folder drop (a descriptor, a `cases/` dir, a runner), so the loader/gate/gallery extend for free.

### 5.1 Requirements are cross-tier — state them once, prove each tier
Many "UI" requirements are really product rules whose **real boundary is the backend**: *only
signed-in people can post*, *a note is capped at 8 KB*, *an unverified email can't comment*. The UI
does its visible part (sends the token, caps the box, hides the button), but a crafted client
bypasses all of it — so a UI test alone proves only the courtesy, not the guarantee. State the
requirement **once**, next to its UI proof, and give it a **server leaf** whose assertion is the
server's *response* (the easiest is an error: 401/403/413). Two cheap properties make this painless:
the framework already spans tiers (the spec is a product spec, not a UI spec), and a server's
*rejection* paths usually short-circuit before any datastore call, so the server case runs the real
handler with **no database mock** — just the faked request in, the status code out. Conversely, name
the things that are **not** cross-tier: e.g. render-time XSS-safety is the client's job if the server
stores content verbatim — don't invent a server leaf that has no error to assert.

## 6. Rendering HTML (the visual-approval gallery)

For a *requirements* document, the rendered output is not an afterthought — it is the **approval
surface**. The whole reason to lay requirements out as a two-column gallery is that the owner can
**see each state and approve how it looks**, next to the prose that says what it must be. So the
default for a render leaf in a requirements doc is an **inline rendered image** of the state, embedded
in the gallery and committed as the owner-owned expected. A reviewer scrolls the spec and approves the
*pixels*, not a description of them. (A text serialization, below, is a useful *complement* or a
fallback when you genuinely can't render — but on its own it doesn't let anyone see the UI, which is
the point.)

### 6.1 Rendered images (the primary artifact)
Drive the component's **real** DOM (see §3.3/§3.6), fold the **real** stylesheet onto it, and
rasterize. Commit the PNG, embed it inline in the gallery, and compare pixel-exact. Two routes:

- **Real screenshot** via a headless browser (Playwright/Puppeteer). Highest fidelity; heaviest and
  most environment-sensitive (font rendering varies across platforms, so expect a tolerance and CI
  pinning).
- **DOM→SVG→PNG** rasterization (e.g. satori + resvg), driving the component's real DOM + stylesheet
  with a **bundled font** for determinism. Lighter than a browser and byte-deterministic across
  machines (same pinned rasterizer + font), so a pixel-exact gate doesn't flap — at the cost of being
  an *approximation* of the browser's painter, not the painter itself. This is what this repo and the
  GoogleCalendarEventCreator reference use.

Determinism is the price of admission: pin the clock/locale/timezone (§3.5), bundle the font, fix the
render width, and verify the bytes are stable across two regenerations before you trust the gate.

Because a rasterizer is not a browser, expect to bridge what its static model omits — resolve CSS
variables, expand shorthands it doesn't parse, honor `[hidden]`/`display:none` (no UA stylesheet),
and project form-control `.value`s into the tree so a seeded field actually shows. Each is a small,
local adapter; budget for them.

Treat the committed image as an owner-owned expected (§3.4): on a legitimate change, surface
expected / actual / diff and re-baseline only on approval — never silently regenerate to clear a red.

### 6.2 Serialized-DOM text (a complement, or a fallback)
Run the real component into a DOM and serialize the subtree to a **normalized, indented text tree** —
tag, id, classes, an allow-list of meaningful attributes (roles, form affordances, visibility/disabled
flags, live values), collapsed text. It's cheap (no rasterizer, no font, no binaries), and its diff
reads as *intent* — "the class changed from X to Y", "this `aria-live` vanished" — which a binary image
diff hides. Use it **alongside** the image when you want a precise, greppable structural assertion, or
**instead** of it when you can't render (a headless environment, or a UI whose look genuinely doesn't
need approval). What it can't do is let the owner *see* the UI — so it doesn't replace the gallery
image in an approval doc.

### 6.3 What a static render can't capture — don't fake it with pixels
A rasterized DOM is not a live browser: it cannot show an OS **mouse cursor**, a `:hover`/`:active`
state, `cursor: pointer`, scrolling, or focus rings — those aren't static DOM. Don't pin "is
clickable" with a cursor in an image. Cover it three honest ways instead: the **behavior** (a click
does the thing) by a behavior case; the resting **visual cue** (an elevated surface, a chevron) by the
snapshot; and, if you want it, an explicit **DOM assertion** (the element is a `<button>` whose
computed `cursor` is `pointer`) in a logic case — never a snapshot pretending to see the cursor.

### 6.4 The image approves the look — it doesn't verify everything
The gallery image is the approval surface for *how a state looks*, and it's worth getting right. But
it can't observe a click, a navigation, an async transition, or a pure rule — and trying to make it is
the §3.2 anti-pattern. So render the **look** as an image, and route **behavior, state transitions,
content rules, and accessibility** to their own kinds. The big investment is the **harness that drives
the real UI**; the image renderer rides on top of it, and every non-visual kind reuses it too. Get the
harness right and the pixel layer is a thin, deterministic cap.

### 6.5 Crop to the element under test — don't re-approve the whole screen for a chrome change
A requirement about *one element's internal appearance* (a row's byline, a badge, a vote control)
shouldn't be pinned by a snapshot of the **whole screen**. If it is, every cross-cutting change — a
header title, a nav item, surrounding copy — re-renders and forces re-approval of **every** such
golden, though the thing each leaf tests didn't move. The diffs go noisy and the approval surface goes
dilute: a reviewer can't separate "the element this leaf pins changed" from "unrelated chrome shifted".

Make **cropped-element snapshots** a first-class option: render the **same real screen** through the
**same** harness, then rasterize **only** the element the leaf is about (name it by selector). Same
pixel-exact gate, same owner-owned golden — just scoped, so it's **byte-identical** to any change
outside that element and moves *only* when the element does. Split render leaves by **altitude**:
whole-screen snapshots for page/panel-level *states* (what's shown/hidden, an empty/error state,
overall layout), cropped snapshots for a single element's *internal* look. Rule of thumb: **if the
requirement names an element, crop to it; if it names the screen's state, render the screen.** Three
fidelity notes when lifting a subtree out of context: render it at the width it has in place so text
wraps identically; fold the inherited text properties (font, colour) from the excluded ancestors onto
the crop root — a static rasterizer won't cascade from a parent you didn't render; and **frame it with
the surrounding container's padding** so it reads as it sits *in place* (same width/margin, its own
borders) rather than a bare edge-to-edge fragment. (Worked
example: this repo's `component` kind, `dev/requirements/component/`, beside the whole-panel `dom` kind.)

## 7. Anti-patterns to avoid

- **One-mechanism coverage.** A snapshot gate that "covers" clicks and unreachable states. Segment by
  verification (§3.2).
- **Hand-authored expecteds that mirror production.** A parallel implementation that drifts (§3.3).
- **Silent re-baselining.** Regenerating a golden to clear a red without review (§3.4).
- **Clock/locale/timezone in a fixed fixture, unpinned.** Guaranteed rot (§3.5).
- **Stubbing the exact boundary under test.** Proves only the stub (§1, §3.6).
- **Asserting a private formatter's output by re-deriving it.** Assert it *through the real render*
  instead, or export it deliberately.
- **Treating a11y/security as "later".** They're leaves (§3.7).
- **Calling a faked-browser pass "verified".** It's *claimed*; track the real-device gap (§3.8).
- **A CI-only test with unbounded awaits.** Turns a 5-second failure into a 20-minute hang; bound
  every await and self-diagnose (§3.8).

## 8. The shortest version

Number the requirements. Give each exactly one case, of the one kind that can actually verify it.
Produce the actual from the real code; let a human own the expected. Pin the clock, locale, and
timezone; fake the platform. Be honest about what's still only claimed. Rendering is just one of the
kinds — don't let it become the whole story.
