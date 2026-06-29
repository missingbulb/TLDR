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
