import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePage,
  hostMatches,
  DEFAULT_USER_DENYLIST,
  CODE_BLOCKED_HOSTS,
} from '../src/denylist.mjs';

test('hostMatches does suffix matching, not substring matching', () => {
  assert.ok(hostMatches('example.com', 'example.com'));
  assert.ok(hostMatches('www.example.com', 'example.com'));
  assert.ok(!hostMatches('notexample.com', 'example.com'));
  assert.ok(!hostMatches('example.com.evil.com', 'example.com'));
});

test('http(s) pages not on any denylist are commentable', () => {
  assert.deepEqual(evaluatePage('https://example.com/articles/42', []), { commentable: true });
  assert.deepEqual(evaluatePage('http://blog.example.org/post', []), { commentable: true });
});

test('non-http(s) schemes are rejected', () => {
  for (const url of ['chrome://newtab', 'about:blank', 'file:///etc/passwd', 'chrome-extension://abc/x']) {
    assert.equal(evaluatePage(url, []).commentable, false);
    assert.equal(evaluatePage(url, []).reason, 'scheme');
  }
});

test('malformed URLs are rejected', () => {
  assert.deepEqual(evaluatePage('not a url', []), { commentable: false, reason: 'not-a-url' });
});

test('the code (Layer 1) denylist blocks the Web Store and its subdomains', () => {
  for (const host of CODE_BLOCKED_HOSTS) {
    assert.equal(evaluatePage(`https://${host}/category/x`, []).reason, 'code-denylist');
  }
  assert.equal(evaluatePage('https://chrome.google.com/webstore', []).reason, 'code-denylist');
});

test('the user (Layer 2) denylist blocks seeded local hosts', () => {
  assert.equal(evaluatePage('http://localhost:3000/app', DEFAULT_USER_DENYLIST).reason, 'user-denylist');
  assert.equal(evaluatePage('http://127.0.0.1:8080/', DEFAULT_USER_DENYLIST).reason, 'user-denylist');
});

test('search engines are seeded into the default denylist (off by default)', () => {
  assert.equal(evaluatePage('https://www.google.com/search?q=x', DEFAULT_USER_DENYLIST).reason, 'user-denylist');
  assert.equal(evaluatePage('https://www.bing.com/search?q=x', DEFAULT_USER_DENYLIST).reason, 'user-denylist');
  assert.equal(evaluatePage('https://duckduckgo.com/?q=x', DEFAULT_USER_DENYLIST).reason, 'user-denylist');
  // A normal site is still commentable.
  assert.equal(evaluatePage('https://example.com/article', DEFAULT_USER_DENYLIST).commentable, true);
});
