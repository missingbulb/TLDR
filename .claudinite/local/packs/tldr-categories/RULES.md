# TLDR categories — the taxonomy is a data contract with a presentation shadow

Every comment carries exactly one **category**. `shared/categories.mjs` is its single source: the
server validates a posted category against that allowlist, the extension builds its composer picker,
filter bar, badges and per-category look from the same list. What follows is the judgment that no
check carries; the mechanical halves are the pack's two checks (see `README.md`).

## The id is stored data; the label and the look are not

`id` is persisted on every comment, travels on the wire, and forms half of the
`<pageId>#<category>` `CategoryRankIndex` key the leading-comment lookup queries. `label`, copy and
colours are free to change any time. Treat the two as different kinds of thing: relabelling is a
cosmetic edit, re-*id*-ing is a data migration this project has no mechanism for.

## Absent and unknown ids degrade — they never error

Deliberate, and worth preserving when touching either side: the server treats an absent category as
`DEFAULT_CATEGORY` at read time (`category ?? DEFAULT_CATEGORY`) so pre-existing rows need **no
backfill**; an unknown-but-present id renders under its raw id rather than being mislabelled as the
default. New code on either side inherits that posture — an unrecognised category is an older/newer
peer, not a bug to throw on.

Corollary for the GSI: a comment is only reachable through `CategoryRankIndex` if it was written
carrying `categoryPageId`. Comments written before that shipped stay invisible to the leading-comment
query forever — there is no backfill (`dev/docs/architecture.md` §5.3). Don't design a feature that
assumes the index sees all history.

## Categories differ in look, never in behaviour

The owner's constraint (issue #25): a category folder under `extension/src/categories/<id>/` holds
**strictly presentation** — a design descriptor (copy) and a stylesheet scoped to
`body[data-category="<id>"]`. The shared panel code drives every category identically and only reads
those values. When a feature request sounds like "spoilers should also …", it is a change to the
shared panel gated on nothing, or it is not built: no conditional on a category id, no per-category
code path, no logic inside a `design.mjs`. Keeping this true is what makes adding a category a
data edit rather than a feature.

## Growing the set

Appending an entry to `CATEGORIES` **plus** `npm run sync-shared` (the vendored
`*.GENERATED.mjs` copies are byte-identical; CI fails on drift) is the whole functional change — the
picker, the filter bar and the server's validation all pick it up. The presentation layer that must
land alongside it is enforced by `tldr-categories/presentation-lockstep`, because every part of it
fails *silently*: the design registry falls back to the default category and an unlinked stylesheet
simply never applies.
