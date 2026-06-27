// TLDR backend — the only component that contains logic.
//
// One Lambda behind an HTTP API (payload format 2.0) serves two routes:
//   POST /comments  — authenticated (JWT authorizer attached at the API). Writes one comment.
//   GET  /comments  — PUBLIC (no authorizer). Reads all comments for a page. CloudFront-cached.
//
// The authorizer has already verified the Google ID token's signature/issuer/audience/expiry
// before we run, so for POST we trust event.requestContext.authorizer.jwt.claims.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid, decodeTime } from 'ulid';
import { normalizePageUrl, InvalidPageUrlError } from './vendor/normalizeUrl.GENERATED.mjs';

const TABLE_NAME = process.env.TABLE_NAME;
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 8192);
const QUERY_LIMIT = Number(process.env.QUERY_LIMIT ?? 50);
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 10);
const RATE_LIMIT_TTL_SECONDS = 120; // rate-limit counter items self-delete via DynamoDB TTL

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// --- HTTP helpers -----------------------------------------------------------

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : event.body ?? '';
  if (!raw) throw new HttpError(400, 'request body is required');
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'request body must be valid JSON');
  }
}

// --- write path -------------------------------------------------------------

// Atomic per-author throttle. A single conditional UpdateItem increments a per-(author, minute)
// counter only while it's under the limit; the ConditionExpression failing is the "429" signal.
// The counter item carries a TTL so it self-deletes — no cleanup job, no extra infrastructure.
async function enforceRateLimit(authorSub) {
  if (!Number.isFinite(RATE_LIMIT_PER_MINUTE) || RATE_LIMIT_PER_MINUTE <= 0) return;
  const minuteBucket = Math.floor(Date.now() / 60000);
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pageId: `RL#${authorSub}`, commentId: String(minuteBucket) },
        UpdateExpression: 'ADD #count :one SET #ttl = :expiresAt',
        ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
        ExpressionAttributeNames: { '#count': 'count', '#ttl': 'expiresAt' },
        ExpressionAttributeValues: {
          ':one': 1,
          ':limit': RATE_LIMIT_PER_MINUTE,
          ':expiresAt': Math.floor(Date.now() / 1000) + RATE_LIMIT_TTL_SECONDS,
        },
      }),
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new HttpError(429, 'too many comments — slow down and try again in a minute');
    }
    throw err;
  }
}

async function handlePost(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  const authorSub = claims.sub;
  if (!authorSub) throw new HttpError(401, 'missing authenticated identity');
  // Google encodes email_verified as a boolean; API Gateway surfaces claims as strings.
  if (claims.email_verified !== 'true' && claims.email_verified !== true) {
    throw new HttpError(403, 'a verified Google email is required to post');
  }
  const authorName = claims.name || 'Someone';

  const input = parseBody(event);

  let pageId;
  try {
    pageId = normalizePageUrl(input.pageUrl);
  } catch (err) {
    if (err instanceof InvalidPageUrlError) throw new HttpError(400, err.message);
    throw err;
  }

  const text = typeof input.body === 'string' ? input.body.trim() : '';
  if (!text) throw new HttpError(400, 'comment body is required');
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, `comment body exceeds ${MAX_BODY_BYTES} bytes`);
  }

  await enforceRateLimit(authorSub);

  // ULID is unique + lexicographically time-sortable, so a Query returns comments in creation
  // order for free. createdAt is derived from the SAME ULID — one clock read, no drift.
  const commentId = ulid();
  const createdAt = decodeTime(commentId);

  const item = {
    pageId,
    commentId,
    authorSub,
    authorName,
    body: text,
    createdAt,
    pageUrlRaw: typeof input.pageUrl === 'string' ? input.pageUrl : undefined,
    // NOTE: authorEmail is deliberately NOT stored — public reads would make it world-readable.
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return json(201, { comment: toPublicComment(item) });
}

// --- read path --------------------------------------------------------------

// Allowlist projection (NOT a denylist): only these fields are ever returned, so a new internal
// attribute can never leak through the public, CDN-cached read path by accident.
function toPublicComment(item) {
  return {
    commentId: item.commentId,
    body: item.body,
    authorName: item.authorName,
    authorId: item.authorSub, // stable Google sub — enables "is this mine"/moderation later; not PII
    createdAt: item.createdAt,
  };
}

function encodeNextToken(lastEvaluatedKey) {
  if (!lastEvaluatedKey) return undefined;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url');
}

function decodeNextToken(token) {
  if (!token) return undefined;
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid nextToken');
  }
}

async function handleGet(event) {
  const params = event.queryStringParameters ?? {};
  let pageId;
  try {
    pageId = normalizePageUrl(params.pageUrl);
  } catch (err) {
    if (err instanceof InvalidPageUrlError) throw new HttpError(400, err.message);
    throw err;
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pageId = :pageId',
      ExpressionAttributeValues: { ':pageId': pageId },
      // Eventually-consistent on purpose: ~half the read cost, and a sub-second stale read is
      // irrelevant behind a 30–60s CDN TTL. Do NOT "upgrade" this to ConsistentRead.
      ScanIndexForward: true, // ULID sort key => chronological order
      Limit: QUERY_LIMIT,
      ExclusiveStartKey: decodeNextToken(params.nextToken),
    }),
  );

  return json(200, {
    comments: (result.Items ?? []).map(toPublicComment),
    nextToken: encodeNextToken(result.LastEvaluatedKey),
  });
}

// --- entry point ------------------------------------------------------------

export const handler = async (event) => {
  // Match on the stage-independent routeKey ("POST /comments"); fall back to method+path so tests
  // and odd inputs still route. (requestContext.http.path carries a stage prefix on a named stage,
  // so matching the raw path alone would silently 404 everything if the stage were ever renamed.)
  const route =
    event.requestContext?.routeKey ??
    `${event.requestContext?.http?.method} ${event.requestContext?.http?.path ?? event.rawPath}`;
  try {
    if (route === 'POST /comments') return await handlePost(event);
    if (route === 'GET /comments') return await handleGet(event);
    return json(404, { message: 'not found' });
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { message: err.message });
    // Unexpected: log with context for observability, return an opaque 500.
    console.error('unhandled error', { route, error: err });
    return json(500, { message: 'internal error' });
  }
};
