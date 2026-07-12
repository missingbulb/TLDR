# AWS SAM + CloudFront — lessons

Notes for the `server/` backend: the SAM app stack (`template.yaml`) and the CloudFront CDN stack
(`cdn-template.yaml`). Portable subsets would propagate to the corpus separately.

- **The deploy role needs `cloudformation:*` on the *transform macro* and `cloudfront:*` for the CDN — scope
  the data plane, not these.** A role scoped only to your stack ARNs fails change-set creation, and `sam deploy`
  *swallows* the reason as `Failed to create managed resources: Waiter ChangeSetCreateComplete failed … FAILED`.
  The real cause lives only in the CloudFormation **Change sets** tab — e.g. `not authorized to perform:
  cloudformation:CreateChangeSet on resource arn:aws:cloudformation:<region>:aws:transform/Serverless-2016-10-31`.
  Grant `cloudformation:*` and `cloudfront:*` at `Resource: "*"` (the transform, the SAM-managed-bucket stack,
  and region-less CloudFront ARNs aren't your stack); keep `lambda`/`apigateway`/`dynamodb`/`logs`/`iam`/`s3`
  scoped — CloudFormation creates resources *using the deploy role*, so those scopes still bound what's made.
  Never `AdministratorAccess`. Worked example: `server/README.md` §2.3.

- **A brand-new AWS account can't create a CloudFront distribution until AWS verifies it.** The CDN deploy fails
  `AccessDenied: "Your account must be verified before you can add new CloudFront resources"` — an account-level
  anti-abuse gate, not IAM/template. Open a free AWS Support case (Account & billing) to enable it. Non-blocking:
  CloudFront is an optimization, so launch against the app `ApiUrl` directly and add the CDN later by re-pointing
  the client.

- **A failed first `CREATE` needs cleanup before any retry.** The stack sits in `ROLLBACK_COMPLETE` (and the SAM
  managed-bucket bootstrap can sit in `REVIEW_IN_PROGRESS`) — both **can only be deleted, not updated**. Worse,
  `Retain`-policy resources *survive* the rollback orphaned: a failed deploy keeps the `tldr-comments` table
  (`DELETE_SKIPPED`), so the retry fails "table already exists" until you delete the orphan too. Before
  re-running: delete the rolled-back stack **and** any orphaned `Retain` resource.
