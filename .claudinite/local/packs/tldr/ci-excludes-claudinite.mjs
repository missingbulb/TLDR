import { finding } from '../../../shared/engine/checks/helpers/findings.mjs';
import { parseYaml } from '../../../shared/engine/checks/helpers/minimal-yaml.mjs';

// The three test workflows RULES.md documents as excluding `.claudinite/` from
// their trigger paths — the fact behind "a `.claudinite/`-only PR gets no CI,
// don't wait for checks that will never run". A drift guard: if one of them
// starts covering `.claudinite/` (or drops its paths filter entirely), that
// note goes stale silently.
const WATCHED = ['test-extension.yml', 'test-server.yml', 'test-requirements.yml']
  .map((f) => `.github/workflows/${f}`);

// No `paths:` key on a trigger means it fires on every changed file.
const pathsFor = (trigger) => (trigger && typeof trigger === 'object' ? trigger.paths ?? null : null);

const admitsClaudinite = (paths) => {
  if (paths === null) return true;
  if (!Array.isArray(paths)) return false;
  return paths.some((p) => typeof p === 'string' && (p === '**' || p.startsWith('.claudinite/')));
};

const rule = {
  id: 'tldr/ci-excludes-claudinite',
  severity: 'advisory',
  description: 'A test workflow started covering .claudinite/ — the "no CI for .claudinite-only PRs" note in RULES.md may now be stale',
  doc: 'RULES.md',
  why: 'RULES.md tells an unattended growth-task run not to wait for CI on a .claudinite/-only PR because these workflows exclude that path; if one starts covering it, a run would wrongly skip a wait it now needs',

  run(ctx) {
    const out = [];
    for (const file of WATCHED) {
      const text = ctx.read(file);
      if (text === null) continue;
      const on = parseYaml(text)?.on;
      if (!on) continue;
      if (admitsClaudinite(pathsFor(on.pull_request)) || admitsClaudinite(pathsFor(on.push))) {
        out.push(finding(rule, {
          file,
          what: 'this workflow’s trigger paths now cover .claudinite/ (or has no paths filter at all)',
          fix: 'update or remove the "no CI for .claudinite-only PRs" note in RULES.md — the assumption behind it no longer holds',
        }));
      }
    }
    return out;
  },
};

export default rule;
