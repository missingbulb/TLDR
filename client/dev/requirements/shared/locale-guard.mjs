// Shared environment guard for any runner with a locale/timezone-dependent assertion. Older notes
// render an absolute date via the panel's toLocale* call, which follows the runtime's locale AND
// timezone; the requirements npm scripts pin LANG=C.UTF-8 and TZ=UTC (Node's CI/sandbox default too).
// Both the dom snapshots (absolute-date goldens) and the logic time cases (4.4) depend on this, so
// the guard lives here and both runners call it — a maintainer on a non-en-US / non-UTC shell gets an
// actionable message instead of a baffling exact-string diff.
"use strict";

export function assertEnUsUtc(assert) {
  const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
  assert.equal(
    locale,
    "en-US",
    `the UI requirements lane is authored in en-US, but this environment resolves to "${locale}". ` +
      `Set LANG=C.UTF-8 (the requirements npm scripts do) when running/regenerating it.`
  );
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    "the UI requirements lane is authored in UTC; set TZ=UTC (the requirements npm scripts do) when running/regenerating it."
  );
}
