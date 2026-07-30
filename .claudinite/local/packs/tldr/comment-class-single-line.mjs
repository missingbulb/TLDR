import { finding } from '../../../shared/engine/checks/helpers/findings.mjs';

// Converted from this pack's RULES.md: session-transcript.mjs's classesIn()
// scans the WHOLE `Comment class:` line and adds every class token it finds,
// so "Comment class: other — not a correction, feature request, or
// process-change" declares all four, not just `other`. A transcript is
// append-only, so the mistake can't be taken back once written (#113/#114,
// 2026-07-26) — this catches it the moment it happens instead of only when
// the stray token later arms an unrelated gate.
const rule = {
  id: 'tldr/comment-class-single-line',
  severity: 'advisory',
  description: 'A `Comment class:` line naming more than one class may be restating the menu, not declaring a genuine mix',
  doc: '.claudinite/local/packs/tldr/RULES.md',
  scope: 'work',
  why: 'the classifier adds every class token it finds on the line itself, so an explanatory aside naming the other options silently declares them too — and it cannot be corrected after the fact',

  run(work) {
    const turn = work.conversation().ownerTurns().last();
    if (!turn.exists) return [];
    const classes = turn.classes();
    if (classes.size <= 1) return [];
    return [finding(rule, {
      file: '(conversation)',
      what: `the \`Comment class:\` line for the latest reply names ${classes.size} classes (${[...classes].join(', ')})`,
      fix: 'if this is a genuine multi-class comment, no change needed; otherwise write the class alone and move any explanation of what it is not to the next line',
    })];
  },
};

export default rule;
