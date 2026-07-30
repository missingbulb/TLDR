// TLDR's own pack — the repo-level lessons that aren't a canon rule and have no
// home in the mounted canon. Most lessons here are prose because their
// deterministic half is already guarded elsewhere (a canon check, a workflow
// gate), so what's left to carry is the judgment — which file is authoritative,
// which direction a fix goes, and which "obvious" guard would break the release
// pipeline. A lesson that CAN be made deterministic becomes a rule in this pack
// instead, not a paragraph in RULES.md.
//
// Longer-form, activity-scoped project guidance stays where this repo already
// keeps it (dev/procedures/, routed from its CLAUDE.md); this pack is for the
// short, always-on rules the engine injects into every session.
import commentClassSingleLine from './comment-class-single-line.mjs';

export default {
  id: 'tldr',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  rules: [commentClassSingleLine],
};
