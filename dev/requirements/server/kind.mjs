// Kind: server — a server-ENFORCED rule, verified by running the REAL Lambda handler
// (server/src/handler.mjs) and asserting its HTTP response. This is the cross-tier counterpart to a
// UI requirement: for things like "only signed-in people can post" or "a note is size-limited", the
// UI does its part (sends the token, caps the box) but the SERVER is the actual boundary — a crafted
// client bypasses the UI. The owner-approved expected is the coded assertion, typically an error
// status (401/403/413), which the handler returns BEFORE any DynamoDB call, so no AWS mock is needed.
// Runner: server/server.test.mjs.
"use strict";

export default { snapshot: false };
