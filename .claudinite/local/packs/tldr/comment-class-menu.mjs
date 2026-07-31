import { finding } from '../../../shared/engine/checks/helpers/findings.mjs';
import { classificationLine, classesIn } from '../../../shared/engine/checks/helpers/session-transcript.mjs';

// The testable half of RULES.md's "Put the `Comment class:` line on its own
// line": the classifier reads the WHOLE classification line and adds EVERY class
// token it finds (`classesIn()` matches globally), so the natural-sounding
//     Comment class: other — not a correction, feature request, or process-change
// declares all four classes, not `other`. The stray `feature` then arms
// `feature-requirements-first` BLOCKING against whatever commits the branch
// carries, even when the session never touched a product feature.
//
// The signature is positional, not textual: a class token that appears AFTER a
// negation marker on the line and was not already named BEFORE it. That is what
// separates restating the menu (the bug) from an honest multi-class declaration
// (`Comment class: correction, process-change`), which names each part
// positively and must stay silent — the rule is against restating the menu, not
// against mixed comments. Reusing canon's own `classesIn` rather than a copied
// regex keeps the check modelling exactly what the classifier sees, quirks
// included (`other` inside "another" really is a declaration).
//
// ADVISORY, deliberately, where the underlying defect is blocking-grade: the
// transcript is append-only, so by the time this is observable the declaration
// cannot be retracted. A blocking finding could never converge — it would spend
// the session's Stop cycles on something no edit can fix, which is precisely the
// waste the lesson records. Its job is to name the cause the moment it appears
// so the session doesn't re-derive it from an unexplained
// `feature-requirements-first` failure.

// Word-scoped negation/exclusion markers. Kept deliberately small: each one is a
// word that turns the class tokens following it into "the menu I am NOT", which
// is the only construction this rule is about.
const NEGATION_RE = /\b(?:not|no|never|neither|nor|rather than|instead of|excluding|besides)\b|n['’]t\b/i;

const rule = {
  id: 'tldr/comment-class-menu',
  severity: 'advisory',
  description: 'The `Comment class:` line must name only the classes it means — a class named after a negation is still declared',
  doc: '.claudinite/local/packs/tldr/RULES.md',
  scope: 'work',
  why: 'the classifier adds every class token on the classification line, so restating the menu to exclude a class declares it — a stray `feature` arms feature-requirements-first BLOCKING against the branch even when no product feature was touched',

  run(work) {
    // Only the latest owner turn is judged, for the same reason
    // comment-classification judges only that one: the transcript is
    // append-only, so an earlier turn's line was already reported at its own
    // Stop and can never converge.
    const turn = work.conversation().ownerTurns().last();
    if (!turn.exists) return [];
    const line = classificationLine(turn.reply());
    // No classification line at all is comment-classification's finding, not this one.
    if (!line) return [];

    // Everything after the `Comment class:` colon — the prefix cannot contain
    // one (the helper's pattern forbids it), so the first colon is the split.
    const body = line.slice(line.indexOf(':') + 1);
    const negation = NEGATION_RE.exec(body);
    if (!negation) return [];

    const before = classesIn(body.slice(0, negation.index));
    const after = classesIn(body.slice(negation.index));
    const stray = [...after].filter((c) => !before.has(c));
    if (!stray.length) return [];

    return [finding(rule, {
      file: '(conversation)',
      what: `the \`Comment class:\` line declares ${stray.map((c) => `\`${c}\``).join(', ')} by naming ${stray.length > 1 ? 'them' : 'it'} after "${negation[0]}" — every class token on the line counts, however it is phrased`,
      fix: 'write the class alone on its own line — `Comment class: other` — and put any explanation on the NEXT line; a genuinely mixed comment still names each part it really is on that one line, which is fine. The transcript is append-only, so re-declaring cleanly on a later line does not override this one — do not retry, and expect the stray classes\' rules to fire on this branch',
    })];
  },
};

export default rule;
