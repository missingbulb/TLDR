# Testing — lessons

Project-specific testing lessons for TLDR, layered on the shared Claudinite testing practices
(the Claudinite `writing-tests` skill — the portable
canon). Where a local rule refines a portable one, the local one wins; it carries this repo's concrete
files and gotchas. Read before writing or changing a test under `client/`, `server/`, or
`dev/requirements/`. A portable lesson here propagates to the corpus via the separate
`claudinite-lesson` handoff — not as part of writing it down locally.

- **A platform boundary faked in more than one double — teach every double a new use of it.** The
  client's `chrome.*` surface has two independent fakes: the inline stub in `client/test/auth.test.mjs`
  and `dev/requirements/shared/render/fake-chrome.mjs` (which runs the *real* `sidepanel.mjs` under the
  snapshot/behavior harness). When the client starts calling a **new** `chrome.*` API, add it to
  **both** — miss the harness fake and the unmodeled call throws inside the real module, surfacing **far
  from the change** as a DOM-snapshot pixel-diff (plus a behavior case), not an auth error, because the
  broken post renders a different panel. (Adding `chrome.storage.local` for the `login_hint` email
  reddened `posting.2.1` / `saved.2.2` until `fake-chrome.mjs` learned `storage.local`.)
