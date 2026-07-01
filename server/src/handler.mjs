// TLDR backend — the only component that contains logic.
//
// One Lambda behind an HTTP API (payload format 2.0) serves two routes:
//   POST /comments  — authenticated (JWT authorizer attached at the API). Writes one comment.
//   GET  /comments  — PUBLIC (no authorizer). Reads all comments for a page. CloudFront-cached.
//
// The authorizer has already verified the Google ID token's signature/issuer/audience/expiry
// before we run, so for POST we trust event.requestContext.authorizer.jwt.claims.

import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid, decodeTime } from 'ulid';
import { normalizePageUrl, InvalidPageUrlError } from './vendor/normalizeUrl.GENERATED.mjs';
import { isValidCategory, normalizeCategory, DEFAULT_CATEGORY } from './vendor/categories.GENERATED.mjs';

const TABLE_NAME = process.env.TABLE_NAME;
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 8192);
const QUERY_LIMIT = Number(process.env.QUERY_LIMIT ?? 50);
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 10);
const RATE_LIMIT_TTL_SECONDS = 120; // rate-limit counter items self-delete via DynamoDB TTL
const EMAIL_HASH_SALT = process.env.EMAIL_HASH_SALT ?? '';

// Vote items share a comment's page partition (so a cast is one atomic transaction with the
// comment's counter — no GSI, no second table) but must NOT surface in the comment list. Their sort
// key is `VOTE#<commentId>#<voterSub>`; the `VOTE#` prefix sorts strictly ABOVE every comment SK,
// because a comment SK is a canonical ULID whose first char is always a digit '0'–'7' (the 48-bit
// timestamp high bits) and 'V' > '7'. So the read Query bounds the sort key `< VOTE#` to read only
// comments, never votes (issue #22). This is the frozen-format-preserving sentinel the plan flagged.
const VOTE_SK_PREFIX = 'VOTE#';

// One-way, salted hash of the verified email — stored for moderation/abuse correlation only, NEVER
// returned in the public read projection. Emails are low-entropy, so the salt (a server secret) is
// what keeps the stored hash from being trivially reversible. Equal emails hash equally (moderation).
function hashEmail(email) {
  if (!email) return undefined;
  return createHash('sha256').update(`${EMAIL_HASH_SALT}:${String(email).trim().toLowerCase()}`).digest('hex');
}

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

// Resolve the write-time category against the shared allowlist (issue #25, growable curated list).
// An ABSENT category (older client, or a blank value) defaults to DEFAULT_CATEGORY — the additive-only
// contract (§9.1): a new request field is optional with a server-side default, never newly-required.
// A PRESENT but unknown category is a client bug (the client only offers the known list) → 400.
function resolveCategory(raw) {
  if (raw === undefined || raw === null) return DEFAULT_CATEGORY;
  const id = normalizeCategory(raw);
  if (id === '') return DEFAULT_CATEGORY;
  if (!isValidCategory(id)) throw new HttpError(400, `unknown category: ${id}`);
  return id;
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

  const category = resolveCategory(input.category);

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
    category,
    createdAt,
    pageUrlRaw: typeof input.pageUrl === 'string' ? input.pageUrl : undefined,
    // Raw email is NEVER stored (public reads would expose it). We keep a salted one-way hash for
    // moderation only; it is excluded from the public read projection below.
    authorEmailHash: hashEmail(claims.email),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return json(201, { comment: toPublicComment(item) });
}

// --- vote path --------------------------------------------------------------

// Cast (POST) or toggle off (DELETE) the caller's single vote on a comment. Authenticated and
// attributed exactly like a post (same JWT claims guard), since a vote carries the voter's identity.
// The vote lives as its own item in the comment's page partition, and the comment's `voteCount` is
// kept EXACTLY equal to the number of vote items by mutating both in ONE TransactWriteItems:
//   cast    = Put vote (only if absent) + ADD voteCount 1   — idempotent: re-casting is a no-op success.
//   toggle  = Delete vote (only if present) + ADD voteCount -1 — idempotent: removing a missing vote succeeds.
// The page partition isn't derivable from commentId alone, so the body carries `pageUrl`, re-normalized
// server-side (never trusting the client) just like a post. (issue #22)
async function handleVote(event, method) {
  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  const voterSub = claims.sub;
  if (!voterSub) throw new HttpError(401, 'missing authenticated identity');
  // Same bar as posting: a verified Google email. (API Gateway surfaces the boolean claim as a string.)
  if (claims.email_verified !== 'true' && claims.email_verified !== true) {
    throw new HttpError(403, 'a verified Google email is required to vote');
  }

  const commentId = event.pathParameters?.commentId;
  if (!commentId) throw new HttpError(400, 'commentId is required');

  const input = parseBody(event);
  let pageId;
  try {
    pageId = normalizePageUrl(input.pageUrl);
  } catch (err) {
    if (err instanceof InvalidPageUrlError) throw new HttpError(400, err.message);
    throw err;
  }

  const voteSk = `${VOTE_SK_PREFIX}${commentId}#${voterSub}`;

  if (method === 'POST') {
    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              // Create the vote only if this voter hasn't already voted (idempotent cast).
              Put: {
                TableName: TABLE_NAME,
                Item: { pageId, commentId: voteSk, voterSub, votedAt: Date.now() },
                ConditionExpression: 'attribute_not_exists(commentId)',
              },
            },
            {
              // Bump the count on the EXISTING comment; the guard stops a vote on a missing comment
              // from conjuring a body-less stub item (which the read would then surface).
              Update: {
                TableName: TABLE_NAME,
                Key: { pageId, commentId },
                UpdateExpression: 'ADD voteCount :one',
                ConditionExpression: 'attribute_exists(commentId)',
                ExpressionAttributeValues: { ':one': 1 },
              },
            },
          ],
        }),
      );
    } catch (err) {
      if (err.name !== 'TransactionCanceledException') throw err;
      const reasons = err.CancellationReasons ?? [];
      const alreadyVoted = reasons[0]?.Code === 'ConditionalCheckFailed';
      const commentMissing = reasons[1]?.Code === 'ConditionalCheckFailed';
      // A missing comment (and not a duplicate vote) is a real 404; a duplicate vote is the
      // idempotent happy path — the caller's vote is already recorded, so report success.
      if (commentMissing && !alreadyVoted) throw new HttpError(404, 'comment not found');
    }
    return json(200, { ok: true });
  }

  // DELETE — toggle the vote off.
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: { pageId, commentId: voteSk },
              ConditionExpression: 'attribute_exists(commentId)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: { pageId, commentId },
              UpdateExpression: 'ADD voteCount :neg',
              ConditionExpression: 'attribute_exists(commentId)',
              ExpressionAttributeValues: { ':neg': -1 },
            },
          },
        ],
      }),
    );
  } catch (err) {
    if (err.name !== 'TransactionCanceledException') throw err;
    // The only cancellation reachable here is "no vote to remove" (comments aren't deletable in v1,
    // so the comment always exists) — removing a vote that isn't there is an idempotent no-op.
  }
  return json(200, { ok: true });
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
    // The comment's category (issue #25). `?? DEFAULT_CATEGORY` makes the read safe over PRE-EXISTING
    // rows written before categories existed (and any older client that posted without one) — the
    // field is defaulted at read time, so there is no migration/backfill. Additive under §9.1.
    category: item.category ?? DEFAULT_CATEGORY,
    // The endorsement count, maintained atomically with each vote item (handleVote). Default 0 so a
    // never-voted comment still carries the field (the UI always renders the affordance). The
    // viewer's OWN vote (`youVoted`) is deliberately NOT here: it can't ride the shared, CDN-cached
    // read (the cache key excludes Authorization), so the client tracks it locally (issue #22).
    voteCount: item.voteCount ?? 0,
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
      // Bound the sort key below the vote-item prefix so a page's votes (same partition) never leak
      // into the comment list — they sort above every ULID comment SK (see VOTE_SK_PREFIX).
      KeyConditionExpression: 'pageId = :pageId AND commentId < :voteSentinel',
      ExpressionAttributeValues: { ':pageId': pageId, ':voteSentinel': VOTE_SK_PREFIX },
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
  // Version telemetry (issue #29): log the calling client's version on EVERY request — both routes,
  // and `null` when absent, since a client too old to send the header is exactly the cohort we need
  // to count before retiring an old behavior. HTTP API v2 lowercases header keys. This is just a
  // CloudWatch line (queryable via Logs Insights); it never affects the response. Note GET is
  // CloudFront-cached, so read telemetry lands only on cache misses; POST always reaches the origin.
  const clientVersion = event.headers?.['x-client-version'] ?? null;
  console.log('request', { route, clientVersion });
  try {
    if (route === 'POST /comments') return await handlePost(event);
    if (route === 'GET /comments') return await handleGet(event);
    if (route === 'POST /comments/{commentId}/vote') return await handleVote(event, 'POST');
    if (route === 'DELETE /comments/{commentId}/vote') return await handleVote(event, 'DELETE');
    return json(404, { message: 'not found' });
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { message: err.message });
    // Unexpected: log with context for observability, return an opaque 500.
    console.error('unhandled error', { route, error: err });
    return json(500, { message: 'internal error' });
  }
};
