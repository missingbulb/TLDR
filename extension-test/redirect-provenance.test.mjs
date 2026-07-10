// The redirect-provenance model (issue #58): the per-tab navigation reducer the service worker runs,
// and the same-site + strictly-cleaner rule that decides whether an arrival earns the "show notes for
// the cleaner URL" offer. Pure logic — tested here without any chrome.*.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginNavigation,
  commitNavigation,
  cleanerSourceOffer,
  provenanceKeyFor,
} from '../extension/src/redirect-provenance.mjs';

test('provenanceKeyFor derives a per-tab storage key', () => {
  assert.equal(provenanceKeyFor(7), 'redirectProvenance:7');
});

// --- the reducer -------------------------------------------------------------------------------

test('a server redirect records where the navigation started', () => {
  let s = beginNavigation(null, 'https://example.com/article');
  s = commitNavigation(s, { url: 'https://example.com/article?session=abc' });
  assert.deepEqual(s, {
    pendingUrl: null,
    lastCommittedUrl: 'https://example.com/article?session=abc',
    from: 'https://example.com/article',
  });
});

test('a plain navigation records no pre-redirect URL', () => {
  let s = beginNavigation(null, 'https://example.com/a');
  s = commitNavigation(s, { url: 'https://example.com/a' });
  assert.equal(s.from, null);
  assert.equal(s.lastCommittedUrl, 'https://example.com/a');
});

test('a redirect that only sheds tracking params is no redirect (same page id)', () => {
  let s = beginNavigation(null, 'https://example.com/a?utm_source=nl');
  s = commitNavigation(s, { url: 'https://example.com/a' });
  assert.equal(s.from, null);
});

test('a reload of the landing page keeps the arrival story', () => {
  let s = beginNavigation(null, 'https://example.com/a');
  s = commitNavigation(s, { url: 'https://example.com/a?v=2' }); // arrived via redirect
  s = beginNavigation(s, 'https://example.com/a?v=2'); // F5
  s = commitNavigation(s, { url: 'https://example.com/a?v=2' });
  assert.equal(s.from, 'https://example.com/a');
});

test('navigating on to a different page clears the arrival story', () => {
  let s = beginNavigation(null, 'https://example.com/a');
  s = commitNavigation(s, { url: 'https://example.com/a?v=2' });
  s = beginNavigation(s, 'https://example.com/elsewhere');
  s = commitNavigation(s, { url: 'https://example.com/elsewhere' });
  assert.equal(s.from, null);
});

test('a client redirect chains back to where the journey began', () => {
  // open A → server-redirects to B → B's script hops to C: the journey began at A.
  let s = beginNavigation(null, 'https://example.com/a');
  s = commitNavigation(s, { url: 'https://example.com/b' });
  s = beginNavigation(s, 'https://example.com/c');
  s = commitNavigation(s, { url: 'https://example.com/c', qualifiers: ['client_redirect'] });
  assert.equal(s.from, 'https://example.com/a');
});

test('a client redirect with no prior redirect starts the chain at the previous page', () => {
  let s = beginNavigation(null, 'https://example.com/b');
  s = commitNavigation(s, { url: 'https://example.com/b' });
  s = beginNavigation(s, 'https://example.com/c');
  s = commitNavigation(s, { url: 'https://example.com/c', qualifiers: ['client_redirect'] });
  assert.equal(s.from, 'https://example.com/b');
});

test('a client-redirect hop that lands back on the same page id records nothing', () => {
  let s = beginNavigation(null, 'https://example.com/a');
  s = commitNavigation(s, { url: 'https://example.com/a' });
  s = beginNavigation(s, 'https://example.com/a?utm_source=self');
  s = commitNavigation(s, { url: 'https://example.com/a?utm_source=self', qualifiers: ['client_redirect'] });
  assert.equal(s.from, null);
});

test('a commit with no matching before-navigate (recycled worker) is treated as direct', () => {
  const s = commitNavigation(null, { url: 'https://example.com/a?x=1' });
  assert.equal(s.from, null);
  assert.equal(s.lastCommittedUrl, 'https://example.com/a?x=1');
});

// --- the offer rule ----------------------------------------------------------------------------

const offer = (fromUrl, toUrl, userDenylist) => cleanerSourceOffer({ fromUrl, toUrl, userDenylist });

test('a same-site redirect from a strictly-cleaner URL earns the offer', () => {
  assert.deepEqual(offer('https://example.com/article', 'https://example.com/article?session=abc123'), {
    pageId: 'https://example.com/article',
  });
});

test('a locale-path redirect earns the offer (the redirect added a path)', () => {
  assert.deepEqual(offer('https://example.com/docs', 'https://example.com/en-US/docs'), {
    pageId: 'https://example.com/docs',
  });
});

test('a www/apex host difference still counts as the same site', () => {
  assert.deepEqual(offer('https://example.com/a', 'https://www.example.com/a?variant=b'), {
    pageId: 'https://example.com/a',
  });
});

test('a cross-site redirect (a link shortener) never earns the offer', () => {
  assert.equal(offer('https://t.co/x9', 'https://example.com/some/long/article?id=1'), null);
});

test('a redirect whose source is not strictly cleaner never earns the offer', () => {
  assert.equal(offer('https://example.com/a?x=1&y=2', 'https://example.com/a?x=1'), null);
  assert.equal(offer('https://example.com/a', 'https://example.com/b'), null); // same length
});

test('a source that normalizes to the same page id never earns the offer', () => {
  assert.equal(offer('https://example.com/a?utm_source=nl', 'https://example.com/a'), null);
});

test('a non-http(s) or denylisted source never earns the offer', () => {
  assert.equal(offer('ftp://example.com/a', 'https://example.com/a?x=1'), null);
  assert.equal(offer('not a url', 'https://example.com/a?x=1'), null);
  assert.equal(offer('https://example.com/a', 'https://example.com/a?x=1', ['example.com']), null);
});

test('missing inputs never earn the offer', () => {
  assert.equal(offer(null, 'https://example.com/a?x=1'), null);
  assert.equal(offer('https://example.com/a', null), null);
});
