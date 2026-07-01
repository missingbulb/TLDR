// Guards the stack-name-derived table naming in template.yaml — the isolation contract for the
// dev/sandbox environment (#27). Production is the canonical `tldr-app` stack and its table name is
// PINNED in source to `tldr-comments` (renaming would REPLACE the live table with an empty one); it
// takes no environment parameter, so nothing passed at deploy time can repoint it. Any other stack
// gets its own stack-scoped table, so dev can't share prod's data store. Parsing CloudFormation
// intrinsic tags with a real YAML lib needs custom tag handling, so we assert against the template
// text directly — which doubles as a drift guard: change the !If form and the assertion fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(resolve(here, '../template.yaml'), 'utf8');

// Pull the prod stack name and the pinned prod table literal straight from the template so these
// assertions track the source rather than re-hardcoding the values.
function prodStackName() {
  const m = template.match(/IsProd:\s*!Equals \[!Ref AWS::StackName, (\S+)\]/);
  return m && m[1];
}
function prodTableLiteral() {
  const m = template.match(/TableName:\s*!If \[IsProd, (\S+),/);
  return m && m[1];
}

// Mirror the template's `!If [IsProd, <prod literal>, !Sub '${AWS::StackName}-comments']`. The
// structural assertion below is the drift guard that keeps this mirror honest.
function resolveTableName(stackName) {
  return stackName === prodStackName() ? prodTableLiteral() : `${stackName}-comments`;
}

test('production is pinned by stack name, not an external parameter', () => {
  assert.match(template, /IsProd:\s*!Equals \[!Ref AWS::StackName, tldr-app\]/);
  // No Environment parameter exists — prod's identity is codified, not chosen at invocation.
  assert.doesNotMatch(template, /\n  Environment:\n/);
  // The table name is not an overridable parameter either (the same-named Output is fine — it's a
  // parameter, i.e. a `Name:` immediately followed by `Type:`, that must not exist).
  assert.doesNotMatch(template, /CommentsTableName:\s*\n\s+Type:/);
});

test('the table name derives from the stack name (prod literal vs stack-scoped)', () => {
  assert.match(
    template,
    /TableName:\s*!If \[IsProd, tldr-comments, !Sub '\$\{AWS::StackName\}-comments'\]/,
  );
});

test('prod keeps the exact legacy table name, hard-coded (no replacing rename)', () => {
  assert.equal(prodStackName(), 'tldr-app');
  assert.equal(prodTableLiteral(), 'tldr-comments');
  assert.equal(resolveTableName('tldr-app'), 'tldr-comments');
});

test('dev and prod resolve to distinct physical tables (no shared data store)', () => {
  assert.equal(resolveTableName('tldr-app-dev'), 'tldr-app-dev-comments');
  assert.notEqual(resolveTableName('tldr-app-dev'), resolveTableName('tldr-app'));
});

test('an ad-hoc stack name also gets its own table, never prod’s', () => {
  assert.equal(resolveTableName('tldr-app-experiment'), 'tldr-app-experiment-comments');
  assert.notEqual(resolveTableName('tldr-app-experiment'), prodTableLiteral());
});

// CORS allows the client's X-Client-Version header (issue #29). The client attaches it to every
// request; a custom header makes even the public GET a non-simple request, so the browser preflights
// it and API Gateway must list it in AllowHeaders — drop this and reads/posts break in-browser only
// (never in a unit test), so this guard stands in for that missing platform feedback.
test('CORS allows the client version header (X-Client-Version)', () => {
  assert.match(template, /AllowHeaders:[\s\S]*?- x-client-version/);
});

// The vote routes are attributed writes, so — like POST /comments — they MUST opt into the Google
// JWT authorizer (issue #22). A route missing the Authorizer is invisible to the unit/requirements
// handler tests (which feed claims directly), so this template guard stands in for that missing
// platform feedback: both vote events carry `Path: /comments/{commentId}/vote` and `Authorizer:
// GoogleJwt`.
test('both vote routes opt into the Google JWT authorizer (attributed writes)', () => {
  for (const method of ['POST', 'DELETE']) {
    const route = new RegExp(
      `Method: ${method}\\s*\\n\\s*Path: /comments/\\{commentId\\}/vote\\s*\\n\\s*Auth:\\s*\\n\\s*Authorizer: GoogleJwt`,
    );
    assert.match(template, route, `${method} /comments/{commentId}/vote must attach GoogleJwt`);
  }
});

// Toggling a vote off deletes the vote item, so the runtime role needs dynamodb:DeleteItem on top of
// the post path's Put/Update/Query (a TransactWriteItems is authorized by its underlying per-item
// actions). Missing it fails only at runtime in a real account, never in a mock — so guard it here.
test('the runtime role can delete items (vote toggle-off needs DeleteItem)', () => {
  assert.match(template, /Action:[\s\S]*?- dynamodb:DeleteItem/);
});
