# TLDR — Claude agent guidelines

The shared Claudinite corpus first, then this repo's own project guidance layered on top.

@.claudinite/CLAUDE.md
@dev/procedures/CLAUDE.md

> Claudinite self-check: if the `@.claudinite/CLAUDE.md` import above did not resolve (the `.claudinite/` payload is absent — e.g. no `.claudinite/README.md`), the Claudinite harness is **not active** this session. Treat it as not loaded and confirm with the user before substantive work, since a launch-layer hook failure can eat the sync hook's own not-loaded directive.
