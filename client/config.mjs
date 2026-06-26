// Owner-edited configuration. Replace BOTH placeholders before building or loading the extension,
// and set the matching `host_permissions` host in manifest.json.
//
// API_BASE_URL  — in dev, the app stack's ApiUrl output (https://<id>.execute-api.<region>.amazonaws.com);
//                 in prod, the CloudFront domain (https://<dist>.cloudfront.net). No trailing slash.
// GOOGLE_CLIENT_ID — the Google Cloud OAuth "Web application" client id (same value the server's
//                 JWT authorizer uses as its audience).

export const API_BASE_URL = 'https://api.tldr.example';
export const GOOGLE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com';
