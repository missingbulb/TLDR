// Model builders for `server` evidence cards — an HTTP transaction rendered FROM the real handler run
// the case drives: the request the handler received (method, route, claims, and the outbound BODY the
// client sent) and the response it returned (a status pill + body). Every value is read off the real
// run, so a card can't depict a transaction the handler didn't make. The renderer (evidence-renderer)
// stays generic; these just assemble the SERVER-shaped block list.
"use strict";

const parseBody = (res) => {
  try {
    return JSON.parse(res.body);
  } catch {
    return {};
  }
};

// A request → response transaction card. `request` is the {k,v} rows to show (identity/claims, body).
export function serverTxnModel({ id, title, method, route, request, res }) {
  const body = parseBody(res);
  return {
    tag: "SERVER",
    id,
    title,
    blocks: [
      { type: "req", method, route, rows: request },
      { type: "res", statusCode: res.statusCode, rows: body.message ? [{ k: "message", v: body.message }] : [] },
    ],
  };
}

// A public-read projection card: the GET, then a kept-vs-dropped list. `stored` is the (curated) raw
// item the backing store held; each field is tagged 'surfaced' or 'held back' by checking what the
// real response actually returned — so the allowlist projection (count out, voter identity never out)
// is visible by eye.
export function serverProjectionModel({ id, title, route, stored, res }) {
  const returned = parseBody(res).comments?.[0] ?? {};
  const KEPT = { bg: "#dcfce7", fg: "#166534" };
  const DROPPED = { bg: "#fee2e2", fg: "#991b1b" };
  const rows = Object.keys(stored).map((f) => {
    const surfaced = f in returned;
    return {
      k: f,
      v: surfaced ? String(returned[f]) : "held back",
      tag: surfaced ? "surfaced" : "dropped",
      tagColor: surfaced ? KEPT : DROPPED,
    };
  });
  return {
    tag: "SERVER",
    id,
    title,
    blocks: [
      { type: "req", method: "GET", route, rows: [{ k: "auth", v: "(none) — public, CDN-cached read" }] },
      { type: "kv", heading: "stored item  →  public projection", rows },
    ],
  };
}
