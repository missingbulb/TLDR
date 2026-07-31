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
// This asserts the MANDATED FORM, not the author's intent. The prose tells the
// agent to write the class alone and put any explanation on the next line, so
// the line either is that or it is not — a question every character of it
// answers. An earlier draft chased intent instead, firing only on a class token
// that followed a negation word from a hand-picked list ("not", "never",
// "besides", …). That is unbounded in the wrong direction: the harm comes from a
// class token being PRESENT, and prose smuggles them in without negating
// anything. Probed against the real helper, that draft stayed silent on
//     Comment class: other — unrelated to any feature request      (declares feature)
//     Comment class: other, setting the feature question aside     (declares feature)
//     Comment class: correction | feature | process-change | other (declares all four)
// — the last a verbatim paste of the menu out of the classifier's own prompt,
// i.e. the likeliest way this bug is reproduced, missed by the check named for
// it. Checking the form catches all three and needs no word list, because a
// conforming line has nowhere to hide a token.
//
// A genuinely mixed comment stays legal and stays silent: it names each part it
// really is, positively, on that one line (`Comment class: correction,
// process-change`). Whether four comma-separated classes are "honest" is exactly
// the intent judgment this rule refuses to make — the form is respected, so the
// classifier does what the line asked.
//
// ADVISORY, deliberately, where the underlying defect is blocking-grade: the
// transcript is append-only, so by the time this is observable the declaration
// cannot be retracted. A blocking finding could never converge — it would spend
// the session's Stop cycles on something no edit can fix, which is precisely the
// waste the lesson records. Its job is to name the cause the moment it appears
// so the session doesn't re-derive it from an unexplained
// `feature-requirements-first` failure.

// One class token, spelled as the classifier's own alternation spells it, so
// this check models what `classesIn()` sees rather than a second opinion of it.
const CLASS = String.raw`(?:correction|feature|process[\s-]change|other)`;
// The mandated form: class tokens joined by a declaration separator, nothing
// else. `|` is deliberately NOT a separator — it is how the prompt renders the
// menu, so pasting the menu verbatim fails this pattern rather than reading as
// a four-class declaration.
const CONFORMING_RE = new RegExp(String.raw`^\s*${CLASS}(?:\s*(?:,|&|\+|and)\s*${CLASS})*\s*\.?\s*$`, 'i');

const rule = {
  id: 'tldr/comment-class-menu',
  severity: 'advisory',
  description: 'The `Comment class:` line must carry the class alone — every class token on it is declared, however the line phrases them',
  doc: '.claudinite/local/packs/tldr/RULES.md',
  scope: 'work',
  why: 'the classifier adds every class token on the classification line, so any explanation sharing that line declares the classes it mentions — a stray `feature` arms feature-requirements-first BLOCKING against the branch even when no product feature was touched',

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
    const declaration = line.slice(line.indexOf(':') + 1);
    if (CONFORMING_RE.test(declaration)) return [];

    const declared = [...classesIn(declaration)].sort();
    // A line naming no class at all is unclassified — comment-classification's
    // finding, not this one.
    if (!declared.length) return [];

    const arms = declared.includes('feature')
      ? ', including `feature`, which arms `feature-requirements-first` BLOCKING against this branch'
      : '';

    return [finding(rule, {
      file: '(conversation)',
      what: `the \`Comment class:\` line carries more than the class it means, so the classifier reads it as declaring ${declared.map((c) => `\`${c}\``).join(', ')}${arms}`,
      fix: 'write the class alone on its own line — `Comment class: other` — and put any explanation on the NEXT line; a genuinely mixed comment names each part it really is, comma-separated, on that one line. The transcript is append-only, so re-declaring cleanly on a later line does not override this one — do not retry, and expect the declared classes\' rules to fire on this branch',
    })];
  },
};

export default rule;
