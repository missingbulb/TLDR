// Runs the REAL server handler (server/src/handler.mjs) against a faked HTTP-API v2 event, for the
// `server` kind. Imported LAZILY (only inside a case's verify()), so loading the case list for the
// coverage gate never pulls in the AWS SDK. The handler's deps resolve from server/node_modules.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { handler } = await import(pathToFileURL(path.join(ROOT, "server", "src", "handler.mjs")).href);

// POST /comments with the given JWT claims (the API-Gateway authorizer's output) and JSON body.
export function postComment({ claims = {}, body } = {}) {
  return handler({
    requestContext: {
      routeKey: "POST /comments",
      http: { method: "POST", path: "/comments" },
      authorizer: { jwt: { claims } },
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const VALID_CLAIMS = { sub: "user-123", name: "Ada", email: "ada@example.com", email_verified: "true" };
