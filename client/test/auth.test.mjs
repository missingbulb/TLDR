import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthUrl,
  parseRedirectFragment,
  decodeJwtPayload,
  isExpired,
  randomToken,
} from '../src/auth.mjs';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function makeJwt(payload) {
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.signature`;
}

test('buildAuthUrl requests an id_token with the right scope and binding params', () => {
  const url = new URL(
    buildAuthUrl({ clientId: 'cid', redirectUri: 'https://abc.chromiumapp.org/', nonce: 'n1', state: 's1' }),
  );
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('response_type'), 'id_token');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://abc.chromiumapp.org/');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('nonce'), 'n1');
  assert.equal(url.searchParams.get('state'), 's1');
});

test('parseRedirectFragment extracts id_token and state from the URL fragment', () => {
  const got = parseRedirectFragment('https://abc.chromiumapp.org/#id_token=TOK&state=s1&token_type=bearer');
  assert.equal(got.idToken, 'TOK');
  assert.equal(got.state, 's1');
  assert.equal(got.error, null);
});

test('parseRedirectFragment surfaces an error param', () => {
  const got = parseRedirectFragment('https://abc.chromiumapp.org/#error=access_denied');
  assert.equal(got.error, 'access_denied');
});

test('decodeJwtPayload decodes the (unpadded, UTF-8) payload segment', () => {
  const jwt = makeJwt({ sub: '123', name: 'Adël', nonce: 'n1', exp: 1700000000 });
  const payload = decodeJwtPayload(jwt);
  assert.equal(payload.sub, '123');
  assert.equal(payload.name, 'Adël'); // non-ASCII survives
  assert.equal(payload.nonce, 'n1');
});

test('decodeJwtPayload rejects a malformed token', () => {
  assert.throws(() => decodeJwtPayload('only.two'), /malformed JWT/);
});

test('isExpired respects the skew window with an injected clock', () => {
  const exp = 1_000_000; // seconds
  const expMs = exp * 1000;
  assert.equal(isExpired({ exp }, expMs - 10 * 60 * 1000, 300), false); // 10 min before exp, not expired
  assert.equal(isExpired({ exp }, expMs - 60 * 1000, 300), true); // 1 min before exp, inside 5-min skew
  assert.equal(isExpired({ exp }, expMs + 1000, 300), true); // past exp
  assert.equal(isExpired({}, 0, 300), true); // no exp claim => treat as expired
});

test('randomToken returns a unique-ish hex string of the requested length', () => {
  const a = randomToken(16);
  const b = randomToken(16);
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});
