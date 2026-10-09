---
name: sam-template
description: Shaping a SAM template's CloudFront, API Gateway CORS, cache and DynamoDB index resources. Use when editing a SAM template.yaml or template.yml.
metadata:
  body: guidelines
  usage:
    expect: triggered
  force-load-on-file-edits-paths:
    - "**/template.yaml"
    - "**/template.yml"
---

# SAM template resources

## CloudFront and the cache

- **CloudFront won't forward `Authorization` via a *custom* origin-request policy** — a custom
  `AWS::CloudFront::OriginRequestPolicy` listing `Authorization` is rejected at deploy ("The
  parameter Headers contains Authorization that is not allowed"). To forward it to the origin while
  keeping it out of the cache key (so public GETs share one cached entry), attach the **managed**
  `AllViewerExceptHostHeader` policy (id `b689b0a8-53d0-40ab-baf2-68738e2966ac`) plus a custom cache
  policy that omits `Authorization`. Use the *ExceptHostHeader* variant specifically: forwarding the
  viewer `Host` to an API Gateway origin returns 403. (cloudfront-wont-forward)

- **A CDN cache hit is served before the request reaches the origin or its authorizer**, so you
  cannot enforce request auth on a *cacheable* read without edge compute (Lambda@Edge) — and keying
  the cache per token destroys the hit rate that justified caching. Treat cacheable endpoints as
  public by design, and protect only uncached (write / per-user) paths at the authorizer.
  (cdn-cache-hit)

- **Prefer a short CloudFront TTL over per-write cache invalidation.** Invalidation is billed per
  path beyond a small monthly free allowance, so a write-through design that invalidates on every
  write is a cost trap; a short TTL plus optimistic local rendering hides the propagation delay from
  the writer. (prefer-short-cloudfront)

## API Gateway CORS

- **API Gateway HTTP API (v2) rejects a `chrome-extension://` origin in CORS `AllowOrigins`** with
  `BadRequestException: Invalid format for origin`, accepting only `http(s)://…` or `*`. An API
  fronted by a browser-extension (or other non-`http`) origin must therefore set `AllowOrigins:
  ['*']` and rely on its **JWT authorizer**, not CORS, as the security boundary. (api-gateway-http)

## DynamoDB

- **Adding a DynamoDB GSI does not backfill existing items.** The `UpdateTable` is additive and
  indexes only items that already carry the index's key attributes; rows written earlier stay
  invisible until each is rewritten with those attributes. Plan an explicit backfill pass if
  pre-existing data must appear in the new index. (adding-dynamodb-gsi)
