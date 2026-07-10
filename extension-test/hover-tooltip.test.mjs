// positionTooltip is pure geometry (offsetWidth/offsetHeight + a settable .style, not a real DOM
// element), so it's unit-tested directly here with plain stub objects. buildTooltipElement calls
// document.createElement and is exercised as a jsdom-rendered `component` snapshot instead (issue #26,
// dev/requirements/requirements.md leaf 11.10) — extension-test/ has no DOM library, by project convention
// (see extension/package.json: no jsdom dependency; DOM-touching code is covered under dev/requirements/).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionTooltip, TOOLTIP_CLASS, truncateBody, MAX_BODY_CHARS } from '../extension/src/hover-tooltip.mjs';

function stubTooltip({ offsetWidth = 280, offsetHeight = 60 } = {}) {
  return { offsetWidth, offsetHeight, style: {} };
}

test('positionTooltip places the tooltip below-right of the anchor by default', () => {
  const tooltip = stubTooltip();
  positionTooltip(tooltip, { left: 100, top: 200, bottom: 220 }, { innerWidth: 1200, innerHeight: 800 });
  assert.equal(tooltip.style.left, '100px');
  assert.equal(tooltip.style.top, '228px'); // bottom (220) + GAP (8)
});

test('positionTooltip clamps to the right edge of the viewport when it would overflow', () => {
  const tooltip = stubTooltip({ offsetWidth: 280 });
  // anchor near the right edge of a 1000px-wide viewport: left=900 + width=280 would overflow.
  positionTooltip(tooltip, { left: 900, top: 100, bottom: 120 }, { innerWidth: 1000, innerHeight: 800 });
  assert.equal(tooltip.style.left, '712px'); // 1000 - 280 - GAP(8)
});

test('positionTooltip flips above the anchor when there is no room below', () => {
  const tooltip = stubTooltip({ offsetHeight: 60 });
  // anchor near the bottom of a 400px-tall viewport: bottom(380) + GAP(8) + height(60) would overflow.
  positionTooltip(tooltip, { left: 10, top: 340, bottom: 380 }, { innerWidth: 1200, innerHeight: 400 });
  assert.equal(tooltip.style.top, '272px'); // top (340) - height (60) - GAP (8)
});

test('positionTooltip falls back to the CSS default size when offsetWidth/offsetHeight are unset (pre-layout)', () => {
  const tooltip = { style: {} }; // no offsetWidth/offsetHeight at all
  positionTooltip(tooltip, { left: 10, top: 10, bottom: 30 }, { innerWidth: 1200, innerHeight: 800 });
  assert.equal(tooltip.style.left, '10px');
  assert.equal(tooltip.style.top, '38px');
});

test('TOOLTIP_CLASS is a stable, namespaced class name (styled via the matching selector in TOOLTIP_STYLE)', () => {
  assert.equal(TOOLTIP_CLASS, 'tldr-hover-tooltip');
});

test('truncateBody leaves a short body untouched', () => {
  assert.equal(truncateBody('a concise note'), 'a concise note');
});

test('truncateBody leaves a body of exactly MAX_BODY_CHARS untouched (boundary)', () => {
  const exact = 'x'.repeat(MAX_BODY_CHARS);
  assert.equal(truncateBody(exact), exact);
});

test('truncateBody crops an over-long body to MAX_BODY_CHARS with a trailing ellipsis', () => {
  const long = 'x'.repeat(MAX_BODY_CHARS + 50);
  const out = truncateBody(long);
  assert.equal(out.length, MAX_BODY_CHARS, 'the ellipsis replaces the last kept char, so length stays at the cap');
  assert.ok(out.endsWith('…'), 'ends with an ellipsis');
});

test('truncateBody trims trailing whitespace before the ellipsis (no " …")', () => {
  // A space right at the cut point would otherwise leave "… " looking like a gap.
  const text = `${'x'.repeat(MAX_BODY_CHARS - 1)}   yyyy`;
  const out = truncateBody(text);
  assert.ok(!/\s…$/.test(out), 'no whitespace immediately before the ellipsis');
  assert.ok(out.endsWith('…'));
});

test('truncateBody coerces a non-string (null/undefined) to an empty string, never throws', () => {
  assert.equal(truncateBody(null), '');
  assert.equal(truncateBody(undefined), '');
});
