import commentClassMenu from './comment-class-menu.mjs';
import releaseRootVersionAlign from './release-root-version-align.mjs';

// TLDR's own pack: the short, always-on repo-level lessons that aren't a canon
// rule and have no home in the mounted canon.
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
