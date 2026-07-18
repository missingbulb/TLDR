// Configuration. The committed API_BASE_URL points at the DEV stack ON PURPOSE: any build NOT bound for
// the store talks to dev — never prod. PROD is reachable in exactly one way: the Chrome Web Store
// submission. At release time the workflow builds the tree twice (see dev/build/tools/build-zip.mjs):
// tldr-prod.zip gets the prod URL injected over this value (from the GitHub variable `API_BASE_URL`) and
// is the ONLY prod-pointed build — it is what's uploaded to the store; tldr.zip (the GitHub Release
// headline download, and every local/unpacked/`build:dev` build) keeps this dev default.
//
// API_BASE_URL  — committed default = the dev app stack's ApiUrl output
//                 (https://<id>.execute-api.<region>.amazonaws.com), i.e. `tldr-app-dev` in the
//                 dev AWS account. The release build overrides it with the PROD app stack's ApiUrl —
//                 also a raw API Gateway URL for now; it becomes the CloudFront domain once the CDN
//                 stack is live (CloudFront isn't in front of prod yet). No trailing slash. (The
//                 extension reaches the API via the server's '*' CORS, so there's no manifest
//                 host_permissions to keep in sync.)
// GOOGLE_CLIENT_ID — the Google Cloud OAuth "Web application" client id (same value the server's JWT
//                 authorizer uses as its audience); injected at build time, stays a placeholder here.

export const API_BASE_URL = 'https://x9yiwjm735.execute-api.il-central-1.amazonaws.com';
export const GOOGLE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com';
