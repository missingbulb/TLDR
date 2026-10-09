# AWS SAM (Serverless Application Model)

- **A deploy role must be able to drive the transform and CloudFront, or change-set creation fails
  with the real reason hidden.** The `Serverless-2016-10-31` transform runs as a macro, so the
  deploy principal needs `cloudformation:*`, and CloudFront management needs `cloudfront:*`, both at
  `Resource: "*"` (scope the *data-plane* grants to your stack instead). `sam deploy` surfaces only
  `Waiter ChangeSetCreateComplete failed` — the actual `AccessDenied` is visible only in the
  CloudFormation console's **Change sets** tab. Don't paper over it with `AdministratorAccess`.
  (deploy-role-must)

- **A brand-new AWS account can't create a CloudFront distribution until AWS verifies it.** The
  deploy fails
  `AccessDenied: Your account must be verified before you can add new CloudFront resources` — an
  account-level anti-abuse gate, not an IAM or template bug. Open a Support case to get the account
  verified, and launch against the origin URL directly meanwhile. (brand-new-aws)

- **A failed first `CREATE` must be cleaned up before you retry.** A stack left in
  `ROLLBACK_COMPLETE` (and a SAM managed-bucket stack stuck in `REVIEW_IN_PROGRESS`) can only be
  *deleted*, never updated. And any resource with `DeletionPolicy: Retain` survives the rollback
  orphaned, so the retry then fails `already exists` until you delete the orphan too.
  (failed-first-create)

- **Review the change set before applying — `Replacement: True` on a stateful resource is a
  data-loss hard stop.** Replacement creates a *new, empty* resource; a DynamoDB table shows it
  whenever an immutable property (its `KeySchema`/`AttributeDefinitions`) changes. Enable stack
  **termination protection** too — it's a one-time CLI/API call (`update-termination-protection`),
  not expressible in the template body. (review-change-set)

- **A custom request header turns even a public GET into a preflighted CORS request.** Any
  non-simple header (e.g. a client-version header) makes the browser send an `OPTIONS` preflight, so
  the API's CORS `AllowHeaders` must list that header or the real request is blocked *in the
  browser* — while server-side unit tests that never run the CORS layer stay green.
  (custom-request-header)

- **Reach AWS from a session with the AWS CLI or a boto3 script — there is no AWS MCP tool.** A
  stack's real state comes from a CLI call (`aws cloudformation describe-stacks …`) — the last
  green deploy workflow only reports the last *deploy*, not the current stack state. The CLI is
  **not pre-installed on the cloud/web runner** (nor `boto3`/`sam`), so declare its install in the
  **environment setup script** (`pip install awscli`, or the official bundle) rather than per
  session; the sandbox already exports `AWS_CA_BUNDLE`, so a TLS failure is not a bundle left
  unset. (reach-aws-session)
