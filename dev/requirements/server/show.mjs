// One-line "shown result" builders for `server` leaves — the real request → response, as markdown
// TEXT (inline-code for the verb/route/status). Generated from the real handler run the case drives,
// and gated by the gallery's refresh-then-compare (build-gallery + gallery.test), so it can't silently
// drift. This is the "show the result in the doc, don't make the reader trust an invisible test"
// principle for a server call: the reader SEES the request that went in (with the field we cared
// about) and the status + message that came back, not a "🛡️ verified by X" pointer. No rasterization.
"use strict";

const parseBody = (res) => {
  try {
    return JSON.parse(res.body);
  } catch {
    return {};
  }
};

// `POST /route` — <identity>, body `<json>` → `<status>` <message>
export function serverTxnLine({ method, route, identity, body, res }) {
  const parts = [];
  if (identity) parts.push(identity);
  if (body !== undefined) parts.push(`body \`${typeof body === "string" ? body : JSON.stringify(body)}\``);
  const msg = parseBody(res).message ? ` ${parseBody(res).message}` : "";
  return `\`${method} ${route}\` — ${parts.join(", ")} → \`${res.statusCode}\`${msg}`;
}

// The public-read projection, shown as kept-vs-dropped fields, derived from the real response:
// `GET /route` → `200` · surfaced `voteCount=12` · dropped `voterSub, authorEmailHash`
export function serverProjectionLine({ route, res, stored }) {
  const returned = parseBody(res).comments?.[0] ?? {};
  const surfaced = Object.keys(stored)
    .filter((k) => k in returned)
    .map((k) => `${k}=${returned[k]}`);
  const dropped = Object.keys(stored).filter((k) => !(k in returned));
  return `\`GET ${route}\` → \`${res.statusCode}\` · surfaced \`${surfaced.join(", ")}\` · dropped \`${dropped.join(", ")}\``;
}
