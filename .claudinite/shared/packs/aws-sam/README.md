# aws-sam pack

Active when the repo has a SAM `template.yaml`/`.yml`.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| The deploy role drives transform and CloudFront | high | correctness | prose: <100 words |
| A new account waits for CloudFront verification | medium | correctness | prose: <100 words |
| Clean up a failed first CREATE | high | correctness | prose: <100 words |
| Review the change set for Replacement | critical | correctness | prose: <100 words |
| A custom header preflights any GET | medium | correctness | prose: <100 words |
| Reach AWS by CLI or boto3 | low | complexity | prose: <100 words |

## Skills

| Skill | Trigger |
|---|---|
| [`sam-template`](skills/sam-template/SKILL.md) | any edit of `template.yaml` / `template.yml` — held by the guard until loaded |
| [`sam-build-and-deps`](skills/sam-build-and-deps/SKILL.md) | any edit of `package.json` or the template — held by the guard until loaded |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `aws-sam/handler-path` | high | correctness | check: blocking |
| `aws-sam/esbuild-dependency` | high | correctness | check: blocking |
| `aws-sam/cloudfront-authorization` | critical | correctness | check: blocking |
