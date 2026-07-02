// candidatePageId is pure (no chrome.*, no DOM) — a thin composition of the already-tested
// evaluatePage/normalizePageUrl primitives, so it's unit-tested directly with plain strings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatePageId } from '../src/link-hover-gate.mjs';

test('candidatePageId resolves a plain http(s) link to its normalized pageId', () => {
  assert.equal(candidatePageId('https://example.com/x?utm_source=foo', []), 'https://example.com/x');
});

test('candidatePageId returns null for a non-http(s) scheme (mailto:)', () => {
  assert.equal(candidatePageId('mailto:someone@example.com', []), null);
});

test('candidatePageId returns null for a non-http(s) scheme (javascript:)', () => {
  assert.equal(candidatePageId('javascript:alert(1)', []), null);
});

test('candidatePageId returns null for a host on the given denylist', () => {
  assert.equal(candidatePageId('https://google.com/search?q=x', ['google.com']), null);
});

test('candidatePageId returns null for a subdomain of a denylisted host', () => {
  assert.equal(candidatePageId('https://www.google.com/search', ['google.com']), null);
});

test('candidatePageId allows a host NOT on the denylist', () => {
  assert.equal(candidatePageId('https://example.com/x', ['google.com']), 'https://example.com/x');
});

test('candidatePageId returns null for an unparseable href', () => {
  assert.equal(candidatePageId('not a url', []), null);
});

test('candidatePageId falls back to the code-level denylist (chrome.google.com) even with an empty user list', () => {
  assert.equal(candidatePageId('https://chrome.google.com/webstore', []), null);
});
