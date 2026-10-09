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

## 2026-09-27 · converted · a shared-constants guard keeps it byte-identical with package.json (#625)
- **Reason:** the rule restated package.json's `test:all` script in prose so a session could see the
  four sub-suites without re-deriving them — always-testable, so it converts. The prose stays: it
  explains what the sub-suites are and gives the runnable capture command, neither of which the
  check's finding message carries. Only the guarded literal was reflowed onto one physical line,
  since a value split across a line break is invisible to the byte-count guard.
- **Actor:** the prose-to-checks-sweep task, running as work item #625.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a `sharedConstants` entry in `.claudinite-settings.json` (flat literal, not regex
  — the script is fixed rather than version-bumped), enforced by the basics pack's generic
  `shared-constants` world check; proven by `test-all-script-sync.test.mjs`.
- **Landed:** #625

## 2026-10-09 · reworded · the guard's carrier followed the repo off the Node engine (#665)
- **Reason:** `.claudinite-settings.json` and the Node fixture are gone; the same `sharedConstants`
  entry now lives in `.claudinite/settings.yaml`, and the Go `shared-constants` check is the proof.
- **Actor:** the prose-to-checks-sweep task, running as work item #665.
- **Model:** Claude Sonnet 5.5.
- **Landed:** #516
