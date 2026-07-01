// Runs the REAL server handler (server/src/handler.mjs) against a faked HTTP-API v2 event, for the
// `server` kind. Imported LAZILY (only inside a case's verify()), so loading the case list for the
// coverage gate never pulls in the AWS SDK. The handler's deps resolve from server/node_modules.
"use strict";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { handler } = await import(pathToFileURL(path.join(ROOT, "server", "src", "handler.mjs")).href);

// The DynamoDB DocumentClient mock + command classes, loaded from the SERVER package (by absolute
// path) so they're the SAME module instances the handler uses — see server/test/mock-ddb.mjs. The
// error-path cases (2.6/2.7/3.5/9.9) return before any DynamoDB call and ignore this; the happy-path
// vote/projection cases (9.7/9.8/9.10) configure it (reset, then `.on(...)`).
const mock = await import(pathToFileURL(path.join(ROOT, "server", "test", "mock-ddb.mjs")).href);
export const { ddbMock, PutCommand, QueryCommand, UpdateCommand, TransactWriteCommand } = mock;

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

// GET /comments?pageUrl=… (public read). Pair with `ddbMock.on(QueryCommand).resolves({ Items })`.
export function getComments({ pageUrl } = {}) {
  return handler({
    requestContext: { routeKey: "GET /comments", http: { method: "GET", path: "/comments" } },
    queryStringParameters: pageUrl ? { pageUrl } : {},
  });
}

// POST or DELETE /comments/{commentId}/vote with the given claims. The path param + the templated
// routeKey mirror what API Gateway passes; the body carries the page url the server re-normalizes.
export function vote({ method = "POST", claims = {}, commentId = "01ARZ3NDEKTSV4RRFFQ69G5FAV", body } = {}) {
  return handler({
    requestContext: {
      routeKey: `${method} /comments/{commentId}/vote`,
      http: { method, path: `/comments/${commentId}/vote` },
      authorizer: { jwt: { claims } },
    },
    pathParameters: { commentId },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const VALID_CLAIMS = { sub: "user-123", name: "Ada", email: "ada@example.com", email_verified: "true" };
