// Seeds the DEV DynamoDB table with a handful of sample comments so a dev build of the extension has
// something to render end-to-end. DEV ONLY — there is a hard guard below that refuses to run against
// the prod table name (`tldr-comments`); seeding is never something prod wants.
//
//   node scripts/seed-dev.mjs                 # -> tldr-comments-dev (default), il-central-1
//   TABLE_NAME=tldr-comments-dev AWS_REGION=il-central-1 node scripts/seed-dev.mjs
//
// Teardown is just the stack delete — `sam delete --config-env dev`. Because the table is Retain it
// survives that as an orphan; delete `tldr-comments-dev` by hand (or empty it) if you want it gone.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ulid, decodeTime } from 'ulid';
import { normalizePageUrl } from '../src/vendor/normalizeUrl.GENERATED.mjs';

const PROD_TABLE_NAME = 'tldr-comments';
const TABLE_NAME = process.env.TABLE_NAME || 'tldr-comments-dev';

// The whole point of a dev sandbox is that it can't touch prod data. Make that impossible here too:
// refuse to write to the prod table no matter what, so a stray TABLE_NAME can't corrupt real data.
if (TABLE_NAME === PROD_TABLE_NAME) {
  console.error(`Refusing to seed the prod table (${PROD_TABLE_NAME}). This script is dev-only.`);
  process.exit(1);
}

const SAMPLE_PAGES = [
  {
    pageUrl: 'https://example.com/',
    comments: [
      { authorName: 'Ada', body: 'First! This is a seeded dev comment.' },
      { authorName: 'Grace', body: 'Reply test — does threading order hold?' },
    ],
  },
  {
    pageUrl: 'https://en.wikipedia.org/wiki/Chrome_extension',
    comments: [{ authorName: 'Linus', body: 'Seeded note on a different page to exercise pageId keying.' }],
  },
];

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

async function seed() {
  let written = 0;
  for (const page of SAMPLE_PAGES) {
    const pageId = normalizePageUrl(page.pageUrl);
    for (const c of page.comments) {
      // Match the handler's item shape so seeded rows read back exactly like real ones. ULID gives a
      // unique, time-sortable commentId and createdAt comes from the SAME ULID — no separate clock read.
      const commentId = ulid();
      const item = {
        pageId,
        commentId,
        authorSub: `seed|${c.authorName.toLowerCase()}`,
        authorName: c.authorName,
        body: c.body,
        createdAt: decodeTime(commentId),
        pageUrlRaw: page.pageUrl,
      };
      await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
      written += 1;
    }
  }
  console.log(`Seeded ${written} comment(s) into ${TABLE_NAME}.`);
}

seed().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
