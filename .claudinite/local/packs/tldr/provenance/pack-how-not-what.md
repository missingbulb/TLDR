## 2026-07-27 · born · Record that packs home procedures, not feature definitions (#123)
- **Source:** the weekly growth-discover-packs run (#113) authored a `tldr-categories` local pack
  (#121) whose blocking checks asserted the category taxonomy's presentation-lockstep contract; #121
  was closed unmerged over this.
- **Reason:** that contract is a statement about what the product does, so it is a requirement;
  landing it here keeps next week's run from re-authoring it. The silent-failure risk #121 named is
  real and is a requirements gap.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a `##` section in RULES.md with the categories pack as the worked example.
- **Landed:** #123, Refs #113, #121.

## 2026-08-19 · reaffirmed · restored after a mistaken growth-dedup prune (#307)
- **Source:** #220's growth-dedup (2026-08-10) removed the rule on the claim the canon now carried
  it; the conversation-half extract over issue #113's capture found no canon pack states the
  distinction.
- **Reason:** the prune was a mistake, so the rule was re-landed with that history attached.
- **Actor:** the growth-extract run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #307, Refs #305.

## 2026-09-02 · reworded · history moved out to references.md (#442)
- **Reason:** the references convention: the #113/#121/#123/#220 narrative moved to `references.md`
  (RULES-5), the rule keeping the worked example and its consequence. Shrink-only.
- **Actor:** an implement-request run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Retire when:** the `categories.mjs` presentation-lockstep gap is closed in `dev/requirements/`,
  at which point the worked example may go.
- **Landed:** #442, Refs #437.

## 2026-09-20 · reaffirmed · the lockstep gap still open (#580)
- **Source:** leaf 10.6's case asserts the stylesheet, the registry/design descriptor and the
  composer copy, but nothing in `dev/requirements/` asserts the per-id `sidepanel.html` link.
- **Reason:** the worked example still names a live gap; not a retirement candidate.
- **Actor:** the rule-revalidation run, merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Landed:** #580, Refs #572.

## 2026-09-25 · reworded · brought onto the marker convention (#614)
- **Reason:** the `##` section became one marked rule keyed to wanting a product rule in a pack; the
  worked example kept inline.
- **Actor:** @missingbulb (owner), approving the restructure in a Claude Code session.
- **Landed:** #614
