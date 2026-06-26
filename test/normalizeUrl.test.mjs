// Corpus test for the canonical URL normalizer. Per the repo's testing practices, the normalizer
// is run over a realistic corpus (not just hand-picked happy paths) including the cases that have
// historically bitten apex-stripping helpers (tel-aviv.gov.il must NOT lose its apex).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePageUrl, InvalidPageUrlError } from '../shared/normalizeUrl.mjs';

const CASES = [
  // [input, expected]
  ['https://example.com/articles/42', 'https://example.com/articles/42'],
  ['https://Example.com/Articles/42/?utm_source=x#frag', 'https://example.com/Articles/42'],
  ['https://example.com', 'https://example.com'],
  ['https://example.com/', 'https://example.com'],
  ['http://EXAMPLE.com:80/Path/', 'http://example.com/Path'],
  ['https://example.com:443/a', 'https://example.com/a'],
  ['https://example.com:8443/a/', 'https://example.com:8443/a'],
  ['https://example.com/a//', 'https://example.com/a'],
  ['https://example.com/a//b/', 'https://example.com/a//b'],
  // Must NOT apex-strip: a registry-label host stays intact (the documented gov.il bug).
  ['https://tel-aviv.gov.il/page', 'https://tel-aviv.gov.il/page'],
  ['https://sub.domain.co.uk/x?a=1&b=2', 'https://sub.domain.co.uk/x'],
  ['https://example.com/search?q=hello%20world', 'https://example.com/search'],
  ['https://xn--80ak6aa92e.com/', 'https://xn--80ak6aa92e.com'],
  ['https://例え.テスト/path', 'https://xn--r8jz45g.xn--zckzah/path'], // IDN -> punycode
  ['HTTPS://EXAMPLE.COM/UPPER', 'https://example.com/UPPER'],
  ['https://user:pass@example.com/p', 'https://example.com/p'], // userinfo dropped by origin
  ['https://example.com/#/spa/route', 'https://example.com'], // hash route dropped (v1 limitation)
];

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
