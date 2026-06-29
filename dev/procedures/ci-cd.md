# CI/CD (GitHub Actions) — lessons

Notes for `.github/workflows/`.

- **Gate an optional job on a repo *variable*, not a secret.** `secrets.*` are not available in a job-level
  `if:`, so a job gated on a secret can't evaluate its condition and **fails (red)** instead of skipping. Put
  a non-sensitive flag (e.g. a deploy role ARN) in a repository **variable** and gate with
  `if: ${{ vars.X != '' }}` so the job is **skipped (neutral)** until it's configured — keeping the default
  branch green for anyone who hasn't set the integration up. Reserve secrets for the values consumed *inside*
  the job's steps. Worked example: `.github/workflows/deploy.yml`
  (`if: ${{ vars.AWS_DEPLOY_ROLE_ARN != '' && vars.GOOGLE_CLIENT_ID != '' }}`).
