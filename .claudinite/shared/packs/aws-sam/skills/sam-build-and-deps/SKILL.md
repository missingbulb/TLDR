---
name: sam-build-and-deps
description: Declaring a SAM Lambda's build dependencies: esbuild, and bundling the AWS SDK the handler imports. Use when editing package.json or a SAM template's build settings.
metadata:
  body: guidelines
  usage:
    expect: triggered
  force-load-on-file-edits-paths:
    - "package.json"
    - "**/template.yaml"
    - "**/template.yml"
---

# SAM build and dependencies

- **esbuild must be a regular `dependency`, not a `devDependency`.** SAM's esbuild builder runs a
  *production-only* `npm install` in its scratch dir, so a `devDependency` esbuild is skipped and
  the build fails with "Cannot find esbuild." Declare it in `dependencies`, or put it on the
  runner's `PATH` before `sam build`. (esbuild-must-be)

- **Bundle the AWS SDK into the Lambda artifact rather than relying on the managed runtime's copy.**
  The runtime doesn't ship every SDK sub-package (a missing one fails only at invoke), and its
  bundled SDK minor version drifts under you. Declare and bundle the SDK packages you import, and
  pin a non-EOL runtime explicitly rather than letting it float. (bundle-aws-sdk)
