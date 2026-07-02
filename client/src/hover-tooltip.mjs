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

import { designFor } from './categories/registry.mjs';

export const TOOLTIP_CLASS = 'tldr-hover-tooltip';

export const TOOLTIP_STYLE = `
  .${TOOLTIP_CLASS} {
    position: fixed;
    z-index: 2147483647;
    max-width: 280px;
    padding: 10px 12px;
    border-radius: 8px;
    background: #1f2430;
    color: #f5f5f5;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    pointer-events: none;
  }
  .${TOOLTIP_CLASS} p { margin: 0; }
  .${TOOLTIP_CLASS} .label {
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
    margin-bottom: 4px;
  }
  .${TOOLTIP_CLASS} .body { margin-bottom: 4px; white-space: pre-wrap; word-break: break-word; }
  .${TOOLTIP_CLASS} .meta { font-size: 11px; opacity: 0.7; }
`;

// Builds `{ style, tooltip }` for `comment` (a public comment record: { body, authorName, … }) in
// `category`'s voice — a <style> element carrying TOOLTIP_STYLE, and the tooltip element itself. The
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
  body.textContent = comment.body; // textContent, never innerHTML — comment bodies are untrusted

  const meta = doc.createElement('p');
  meta.className = 'meta';
  meta.textContent = comment.authorName || 'Someone';

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
  const width = tooltip.offsetWidth || 280; // falls back to the CSS max-width pre-layout
  const height = tooltip.offsetHeight || 60;

  let left = anchorRect.left;
  if (left + width + GAP > innerWidth) left = Math.max(GAP, innerWidth - width - GAP);

  let top = anchorRect.bottom + GAP;
  if (top + height + GAP > innerHeight) top = Math.max(GAP, anchorRect.top - height - GAP); // flip above

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
