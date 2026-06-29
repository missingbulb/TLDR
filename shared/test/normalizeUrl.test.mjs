// Corpus test for the canonical URL normalizer. Per the repo's testing practices, the normalizer
// is run over a realistic corpus (not just hand-picked happy paths) including the cases that have
// historically bitten apex-stripping helpers (tel-aviv.gov.il must NOT lose its apex).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePageUrl, InvalidPageUrlError } from '../normalizeUrl.mjs';

const CASES = [
  // [input, expected]
  ['https://example.com/articles/42', 'https://example.com/articles/42'],
  ['https://Example.com/Articles/42/?utm_source=x#frag', 'https://example.com/Articles/42'], // all-tracker query dropped
  ['https://example.com', 'https://example.com'],
  ['https://example.com/', 'https://example.com'],
  ['http://EXAMPLE.com:80/Path/', 'http://example.com/Path'],
  ['https://example.com:443/a', 'https://example.com/a'],
  ['https://example.com:8443/a/', 'https://example.com:8443/a'],
  ['https://example.com/a//', 'https://example.com/a'],
  ['https://example.com/a//b/', 'https://example.com/a//b'],
  // Must NOT apex-strip: a registry-label host stays intact (the documented gov.il bug).
  ['https://tel-aviv.gov.il/page', 'https://tel-aviv.gov.il/page'],
  // Meaningful query params are KEPT and sorted by key (stable cache key).
  ['https://sub.domain.co.uk/x?b=2&a=1', 'https://sub.domain.co.uk/x?a=1&b=2'],
  ['https://example.com/search?q=hello%20world', 'https://example.com/search?q=hello+world'],
  // Trackers stripped, real params kept (the YouTube case the owner asked to preserve).
  ['https://www.youtube.com/watch?v=ABC&utm_source=news&feature=share', 'https://www.youtube.com/watch?feature=share&v=ABC'],
  ['https://example.com/p?fbclid=123&gclid=456&id=7', 'https://example.com/p?id=7'],
  ['https://example.com/p?utm_campaign=x', 'https://example.com/p'], // only trackers -> ? dropped
  ['https://xn--80ak6aa92e.com/', 'https://xn--80ak6aa92e.com'],
  ['https://例え.テスト/path', 'https://xn--r8jz45g.xn--zckzah/path'], // IDN -> punycode
  ['HTTPS://EXAMPLE.COM/UPPER', 'https://example.com/UPPER'],
  ['https://user:pass@example.com/p', 'https://example.com/p'], // userinfo dropped by origin
  ['https://example.com/#/spa/route', 'https://example.com'], // hash route dropped (known limitation)
];

test('youtube videos with different ids are DISTINCT pages', () => {
  assert.notEqual(
    normalizePageUrl('https://www.youtube.com/watch?v=AAA'),
    normalizePageUrl('https://www.youtube.com/watch?v=BBB'),
  );
});

const REJECTED = [
  'chrome://newtab',
  'file:///etc/passwd',
  'about:blank',
  'javascript:alert(1)',
  'not a url',
  'ftp://example.com/x',
  '',
];

test('normalizePageUrl produces canonical pageIds', () => {
  for (const [input, expected] of CASES) {
    assert.equal(normalizePageUrl(input), expected, `for input ${JSON.stringify(input)}`);
  }
});

test('normalizePageUrl rejects non-http(s) and malformed URLs', () => {
  for (const bad of REJECTED) {
    assert.throws(() => normalizePageUrl(bad), InvalidPageUrlError, `should reject ${JSON.stringify(bad)}`);
  }
});

test('normalizePageUrl is idempotent (normalizing a pageId yields the same pageId)', () => {
  for (const [, expected] of CASES) {
    assert.equal(normalizePageUrl(expected), expected, `not idempotent for ${expected}`);
  }
});
