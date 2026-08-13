import commentClassMenu from './comment-class-menu.mjs';
import releaseRootVersionAlign from './release-root-version-align.mjs';

// TLDR's own pack — the repo-level lessons that aren't a canon rule and have no
// home in the mounted canon. Most are prose because their deterministic half is
// already guarded elsewhere (a canon check, a workflow gate), so what's left to
// carry is the judgment — which file is authoritative, which direction a fix
// goes, and which "obvious" guard would break the release pipeline. A lesson
// that CAN be made deterministic becomes a rule in this pack instead, not a
// paragraph in RULES.md.
//
// Longer-form, activity-scoped project guidance stays where this repo already
// keeps it (dev/procedures/, routed from its CLAUDE.md); this pack is for the
// short, always-on rules the engine injects into every session.
export default {
  id: 'tldr',
  ruleRoutingGuidance: {
    belongs: "TLDR's repo-level lessons — which file is authoritative, which direction a fix goes, release-pipeline gotchas",
    excludes: 'general software-engineering practice and portable procedure — those live in the vendored Claudinite canon',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [releaseRootVersionAlign],
  workRules: [commentClassMenu],
};
