// A shared DynamoDB DocumentClient mock for tests that drive the handler's happy paths (a Query that
// returns items, a vote transaction). It lives in the SERVER package so `aws-sdk-client-mock` and
// `@aws-sdk/lib-dynamodb` resolve from server/node_modules — the SAME module instances
// server/src/handler.mjs imports — so `mockClient` actually intercepts the handler's calls. The dev
// executable-requirements `server` cases can't import these packages directly (they'd resolve a
// different copy from dev/), so they reach this module by absolute path via handler-harness.mjs.
//
// mockClient patches DynamoDBDocumentClient.prototype.send, so it intercepts the client the handler
// already constructed at import time regardless of load order. Un-stubbed commands resolve to `{}`
// (a Query → no Items, a TransactWrite → success); call `ddbMock.reset()` then `.on(...)` per test.
"use strict";

import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

export const ddbMock = mockClient(DynamoDBDocumentClient);
export { PutCommand, QueryCommand, UpdateCommand, TransactWriteCommand };
