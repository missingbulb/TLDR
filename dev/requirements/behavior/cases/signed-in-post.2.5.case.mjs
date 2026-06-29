// 2.5 — You can read notes without signing in; posting attaches your signed-in identity. This is the
// client half of the auth requirement (the server half — that a write with no identity is rejected —
// is 2.6). Non-visual (it's about which request carries an Authorization header), so it's a behavior
// leaf: a read goes out anonymous, a write carries your bearer token.
"use strict";

export default {
  description: "reading is anonymous; posting attaches your signed-in identity (bearer token)",
  verify: async () => {
    const assert = (await import("node:assert/strict")).default;
    const { open } = await import("../../shared/render/harness.mjs");
    const session = await open("sidepanel", { tabUrl: "https://example.com/article", comments: [] });
    try {
      session.type("Signed-in note.");
      session.submit();
      await session.settle();

      const read = session.fetchLog.find((c) => c.method === "GET");
      const write = session.fetchLog.find((c) => c.method === "POST");
      assert.ok(read && !("authorization" in (read.headers || {})), "the read goes out anonymous (no Authorization header)");
      assert.ok(
        write && /^Bearer \S+\.\S+\.\S+$/.test(String(write.headers.authorization || "")),
        "the write carries a bearer token (a JWT)"
      );
    } finally {
      session.close();
    }
  },
};
