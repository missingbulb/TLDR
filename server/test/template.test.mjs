// Guards the Environment-parameterized table naming in template.yaml — the load-bearing isolation
// change for the dev/sandbox environment (#27). dev and prod MUST resolve to physically distinct
// table names, and prod MUST keep the exact legacy name `tldr-comments` (renaming would REPLACE the
// live table with an empty one). Parsing CloudFormation intrinsic tags (!If/!Equals/!Sub) with a
// real YAML lib needs custom tag handling, so we assert against the template text directly — which
// doubles as a drift guard: change the !If form and the structural assertion fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(resolve(here, '../template.yaml'), 'utf8');

// The default of a String parameter, pulled from the template so these assertions track the source.
function paramDefault(name) {
  const re = new RegExp(`\\n  ${name}:\\n(?:\\s+\\S.*\\n)*?\\s+Default:\\s*(\\S+)`);
  const m = template.match(re);
  return m && m[1];
}

// Mirror the template's `TableName: !If [IsProd, !Ref CommentsTableName, !Sub '${CommentsTableName}-${Environment}']`.
// The structural assertion below is the drift guard that keeps this mirror honest.
function resolveTableName(environment) {
  const base = paramDefault('CommentsTableName');
  return environment === 'prod' ? base : `${base}-${environment}`;
}

test('the IsProd condition keys off the Environment parameter', () => {
  assert.match(template, /IsProd:\s*!Equals \[!Ref Environment, prod\]/);
});

test('the table name is conditional on IsProd (prod literal, non-prod suffixed)', () => {
  assert.match(
    template,
    /TableName:\s*!If \[IsProd, !Ref CommentsTableName, !Sub '\$\{CommentsTableName\}-\$\{Environment\}'\]/,
  );
});

test('prod keeps the exact legacy table name (no replacing rename)', () => {
  assert.equal(paramDefault('CommentsTableName'), 'tldr-comments');
  assert.equal(resolveTableName('prod'), 'tldr-comments');
});

test('dev and prod resolve to distinct physical tables (no shared data store)', () => {
  assert.equal(resolveTableName('dev'), 'tldr-comments-dev');
  assert.notEqual(resolveTableName('dev'), resolveTableName('prod'));
});

test('Environment is constrained to dev|prod and defaults to prod (back-compat)', () => {
  assert.equal(paramDefault('Environment'), 'prod');
  assert.match(template, /Environment:\n(?:\s+\S.*\n)*?\s+AllowedValues: \[dev, prod\]/);
});
