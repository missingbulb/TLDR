// One entry point that renders ANY snapshot case to its golden text. A case's `kind` — set from the
// folder it lives in (loadCases), so it's always present and never guessed — picks the producer.
// Today there is one snapshot kind, `dom`; adding another rendered surface is a new entry in
// PRODUCERS plus a kind folder that names it, and nothing else here changes.
"use strict";

import { openForSnapshot } from "./harness.mjs";
import { serializeDom } from "./serialize-dom.mjs";

// kind -> (case) => Promise<string>. A snapshot case is produced by exactly one of these.
const PRODUCERS = {
  dom: async (testCase) => {
    const session = await openForSnapshot(testCase);
    try {
      return serializeDom(session.document.body);
    } finally {
      session.close();
    }
  },
};

export async function renderSnapshot(testCase) {
  const producer = PRODUCERS[testCase.kind];
  if (!producer) {
    throw new Error(`case "${testCase.name}" has kind "${testCase.kind}" with no snapshot producer (known: ${Object.keys(PRODUCERS).join(", ")})`);
  }
  return producer(testCase);
}

// Does this case produce a committed snapshot? True for a snapshot kind (dom), false for a coded
// kind (behavior/logic). The snapshot runner and the refresh script use this to skip coded cases.
export function rendersSnapshot(testCase) {
  return Boolean(PRODUCERS[testCase.kind]);
}
