// Configuration. The committed API_BASE_URL points at the DEV stack ON PURPOSE: any build NOT produced
// by the release workflow talks to dev — never prod. PROD is reachable in exactly one way: the release
// workflow (.github/workflows/release.yml) injects the prod CloudFront URL over this value at build
// time (from the GitHub variable `API_BASE_URL`; see scripts/build-zip.mjs). That prod-pointed zip is
// BOTH the GitHub Release artifact AND what gets uploaded to the Chrome Web Store — so a release
// download is prod, while a local/unpacked/`build:dev` build keeps this dev default.
//
// API_BASE_URL  — committed default = the dev app stack's ApiUrl output
//                 (https://<id>.execute-api.<region>.amazonaws.com). Set the value below to the dev
//                 stack's ApiUrl after the first dev deploy; until then it's a non-resolving
//                 placeholder. The release build overrides it with the prod CloudFront domain. No
//                 trailing slash. (The extension reaches the API via the server's '*' CORS, so there's
//                 no manifest host_permissions to keep in sync — a test guards this isn't a prod URL.)
// GOOGLE_CLIENT_ID — the Google Cloud OAuth "Web application" client id (same value the server's JWT
//                 authorizer uses as its audience); injected at build time, stays a placeholder here.

export const API_BASE_URL = 'https://dev-api.tldr.invalid';
export const GOOGLE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com';
