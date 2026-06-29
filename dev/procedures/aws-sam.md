# AWS SAM + CloudFront — lessons

Notes for the `server/` backend: the SAM app stack (`template.yaml`) and the CloudFront CDN stack
(`cdn-template.yaml`). Portable subsets would propagate to the corpus separately.

- **`BuildMethod: esbuild` flattens the Handler path.** With a single entry point in a subdirectory
  (`EntryPoints: [src/handler.mjs]`), SAM's esbuild builder writes the bundle to `<artifact-root>/handler.js`
  — the `src/` prefix is stripped (esbuild's default `outbase` is the entry's own dir). Set
  `Handler: handler.handler`, **not** `src/handler.handler`. `sam build` succeeds either way; the wrong value
  fails only at first invoke with `Runtime.ImportModuleError`. Worked example: `server/template.yaml`.

- **esbuild must be a regular `dependency` (or on PATH), never a `devDependency`.** SAM's esbuild builder runs
  a *production-only* `npm install` in its scratch dir, so a `devDependency` esbuild is skipped → `sam build`
  fails with "Cannot find esbuild." We declare `esbuild` in `dependencies` (it's not bundled into the artifact
  unless the handler imports it) **and** install it on the runner's PATH in CI as a belt. Worked example:
  `server/package.json`, and the "Install esbuild on PATH" step in `.github/workflows/server.yml` / `deploy.yml`.

- **CloudFront won't forward `Authorization` via a *custom* origin-request policy.** A custom
  `AWS::CloudFront::OriginRequestPolicy` that lists `Authorization` is rejected at deploy ("The parameter
  Headers contains Authorization that is not allowed"). To forward it to the origin while keeping it **out of
  the cache key** (so public GETs share one cached entry), attach the **managed** `AllViewerExceptHostHeader`
  policy (id `b689b0a8-53d0-40ab-baf2-68738e2966ac`) plus a custom cache policy that omits `Authorization`.
  Forwarding the viewer `Host` to an API Gateway origin returns 403 — hence the *ExceptHostHeader* variant.
  Worked example: `server/cdn-template.yaml`.

- **Cache key and origin forwarding are independent.** A `CachePolicy` defines the cache key; an
  `OriginRequestPolicy` defines what's forwarded to the origin. Set them separately to cache public reads
  (key on the querystring, exclude `Authorization`) while still delivering `Authorization` to the origin for
  authenticated writes. Worked example: `server/cdn-template.yaml`.

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
