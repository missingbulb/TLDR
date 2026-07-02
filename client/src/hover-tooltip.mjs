// Pure DOM builder for the link-hover preview popup (issue #26). No chrome.* here — same pure/impure
// split as optimistic.mjs vs sidepanel.mjs — so it's directly unit-testable and reusable by an
// executable-requirements `component` snapshot with no hover simulation needed.
//
// The popup is mounted (by link-hover.mjs) inside a SHADOW ROOT on an arbitrary third-party page, so it
// intentionally does NOT reuse the side panel's body[data-category="…"] CSS-custom-property theming
// (categories/registry.mjs) — that selector has no meaning outside the extension's own sidepanel
// document, and reaching into a third-party page's cascade for it would fight that page's own styles.
// It carries its own small, self-contained stylesheet instead, mounted alongside it in the same shadow
// root. It still borrows the category's DISPLAY LABEL from the design registry (designFor(id).title) so
// the popup names which category's leading note it's showing — the one piece of that registry that
// still makes sense outside the panel.
//
// Kept deliberately SMALL and BOUNDED (issue #26 owner asks): a tight max-width + compact padding, and
// the body is hard-capped to MAX_BODY_CHARS with an ellipsis so one long note can't grow the popup into
// a wall of text over the page. The note's vote count rides the meta line so the reader sees how
// endorsed the leading note is.

import { designFor } from './categories/registry.mjs';

export const TOOLTIP_CLASS = 'tldr-hover-tooltip';

// The body is capped at this many characters (then an ellipsis). Chosen small so the popup stays a
// glanceable preview, never a scrollable block — the reader opens the side panel for the full thread.
export const MAX_BODY_CHARS = 90;

// Crop an over-long note body to MAX_BODY_CHARS + an ellipsis (pure — no DOM). A non-string coerces to
// "" so a malformed record renders an empty body rather than throwing. Exported so the crop rule is
// unit-tested directly (client/test/hover-tooltip.test.mjs) without a DOM.
export function truncateBody(text) {
  const s = String(text ?? '');
  return s.length > MAX_BODY_CHARS ? `${s.slice(0, MAX_BODY_CHARS - 1).trimEnd()}…` : s;
}

export const TOOLTIP_STYLE = `
  .${TOOLTIP_CLASS} {
    position: fixed;
    z-index: 2147483647;
    max-width: 220px;
    padding: 6px 8px;
    border-radius: 6px;
    background: #1f2430;
    color: #f5f5f5;
    font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    pointer-events: none;
  }
  .${TOOLTIP_CLASS} p { margin: 0; }
  .${TOOLTIP_CLASS} .label {
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
    margin-bottom: 2px;
  }
  .${TOOLTIP_CLASS} .body { margin-bottom: 3px; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
  .${TOOLTIP_CLASS} .meta {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 8px;
    font-size: 10px;
    opacity: 0.75;
  }
  .${TOOLTIP_CLASS} .votes { font-weight: 600; }
`;

// Builds `{ style, tooltip }` for `comment` (a public comment record: { body, authorName, voteCount, … })
// in `category`'s voice — a <style> element carrying TOOLTIP_STYLE, and the tooltip element itself. The
// caller mounts both into a shadow root (or, for a snapshot case, straight into a plain document); this
// function only builds nodes, it never touches window/document globals beyond the injectable `doc`.
export function buildTooltipElement(comment, category, { document: doc = globalThis.document } = {}) {
  const style = doc.createElement('style');
  style.textContent = TOOLTIP_STYLE;

  const tooltip = doc.createElement('div');
  tooltip.className = TOOLTIP_CLASS;
  tooltip.setAttribute('role', 'status');

  const label = doc.createElement('p');
  label.className = 'label';
  label.textContent = designFor(category).title;

  const body = doc.createElement('p');
  body.className = 'body';
  body.textContent = truncateBody(comment.body); // textContent, never innerHTML — bodies are untrusted

  // The meta line: the author on the left, the vote count (▲ glyph, matching the panel's vote rail) on
  // the right, so the reader sees who wrote the leading note and how endorsed it is at a glance.
  const meta = doc.createElement('p');
  meta.className = 'meta';
  const author = doc.createElement('span');
  author.className = 'author';
  author.textContent = comment.authorName || 'Someone';
  const votes = doc.createElement('span');
  votes.className = 'votes';
  votes.textContent = `▲ ${comment.voteCount ?? 0}`;
  meta.append(author, votes);

  tooltip.append(label, body, meta);
  return { style, tooltip };
}

// Position `tooltip` (already mounted, so its offsetWidth/offsetHeight are real) near `anchorRect` (a
// hovered <a>'s getBoundingClientRect()): below-right by default, clamped so it never renders outside
// the viewport, flipping above the link when there's no room below. Pure geometry — no chrome.*.
export function positionTooltip(tooltip, anchorRect, viewport = {}) {
  const GAP = 8;
  const innerWidth = viewport.innerWidth ?? globalThis.innerWidth ?? 1024;
  const innerHeight = viewport.innerHeight ?? globalThis.innerHeight ?? 768;
  const width = tooltip.offsetWidth || 220; // falls back to the CSS max-width pre-layout
  const height = tooltip.offsetHeight || 52;

  let left = anchorRect.left;
  if (left + width + GAP > innerWidth) left = Math.max(GAP, innerWidth - width - GAP);

  let top = anchorRect.bottom + GAP;
  if (top + height + GAP > innerHeight) top = Math.max(GAP, anchorRect.top - height - GAP); // flip above

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
