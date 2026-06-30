// Configuration. The committed API_BASE_URL points at the DEV stack ON PURPOSE: any build that is NOT
// the official Chrome Web Store release talks to dev — never prod. PROD is reachable in exactly one
// way: the release workflow injects the prod CloudFront URL over this value at build time (from the
// GitHub variable `API_BASE_URL`; see scripts/build-zip.mjs). Nothing else ever points at prod, so a
// local/unpacked/sideloaded build cannot reach production by default.
//
// API_BASE_URL  — committed default = the dev app stack's ApiUrl output
//                 (https://<id>.execute-api.<region>.amazonaws.com). Set the value below to the dev
//                 stack's ApiUrl after the first dev deploy; until then it's a non-resolving
//                 placeholder. The release build overrides it with the prod CloudFront domain. No
//                 trailing slash. (Keep manifest.json host_permissions in sync — guarded by a test.)
// GOOGLE_CLIENT_ID — the Google Cloud OAuth "Web application" client id (same value the server's JWT
//                 authorizer uses as its audience); injected at build time, stays a placeholder here.

export const API_BASE_URL = 'https://dev-api.tldr.invalid';
export const GOOGLE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com';
