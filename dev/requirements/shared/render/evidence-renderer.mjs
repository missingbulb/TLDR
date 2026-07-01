// The evidence renderer: turns a small, plain-data EVIDENCE MODEL — assembled by a coded case FROM
// its real run (captured DOM crops, fetchLog entries, the real handler response) — into a committed,
// pixel-gated PNG for the requirements gallery. It shares image-renderer's exact satori→resvg path and
// bundled font, so it's byte-deterministic like every other golden.
//
// HONESTY (why a picture beside a coded rule is safe here): the evidence artifact is NOT the assertion.
// The coded verify() stays the sole gate on whether the requirement holds; this image is a *view* of
// the run, pixel-gated only so it can't silently drift from what the code produces. Every card wears
// its kind tag + a "verify() is the gate" caption so it never reads as "a camera watched this pass",
// and it lives in the `<name>.evidence.png` namespace the coverage gate keeps out of the golden slot.
"use strict";

import { rasterize, FONT_FAMILY } from "./image-renderer.mjs";

const WIDTH = 380;
const PAD = 16;
const CONTENT = WIDTH - PAD * 2;

const C = {
  fg: "#1a1a1a", muted: "#6b7280", faint: "#9ca3af", border: "#e5e7eb",
  accent: "#2563eb", boxBg: "#f9fafb",
};
const TAG = {
  BEHAVIOR: { bg: "#fef3c7", fg: "#92400e" },
  SERVER: { bg: "#e0e7ff", fg: "#3730a3" },
  LOGIC: { bg: "#e2e8f0", fg: "#334155" },
};
const okStatus = (code) => Number(code) >= 200 && Number(code) < 300;
const statusColor = (code) => (okStatus(code) ? { bg: "#dcfce7", fg: "#166534" } : { bg: "#fee2e2", fg: "#991b1b" });
const methodColor = (m) => (m === "GET" ? { bg: "#f3f4f6", fg: "#374151" } : { bg: "#dbeafe", fg: "#1e40af" });

// --- tiny vdom builders (every multi-child box gets an explicit flex; satori requires it) ---------
const el = (style, children) => ({ type: "div", props: { style, children } });
const txt = (content, style = {}) => el({ display: "flex", ...style }, String(content));
const row = (children, style = {}) => el({ display: "flex", flexDirection: "row", alignItems: "center", ...style }, children);
const col = (children, style = {}) => el({ display: "flex", flexDirection: "column", ...style }, children);
const pill = (content, { bg, fg }, extra = {}) =>
  el({ display: "flex", backgroundColor: bg, color: fg, fontSize: 11, fontWeight: 700, paddingTop: 2, paddingBottom: 2, paddingLeft: 7, paddingRight: 7, borderRadius: 5, ...extra }, String(content));

// A labelled key/value row: a fixed-width muted key, a flexible wrapping value, an optional trailing tag.
function kvRow({ k, v, tag, tagColor }) {
  const cells = [
    // Wide enough for the longest field name a projection card shows (e.g. `authorEmailHash`) so the
    // key never overruns its column into the value/tag.
    el({ display: "flex", width: 104, color: C.faint, fontSize: 11, flexShrink: 0 }, String(k)),
    el({ display: "flex", flexGrow: 1, color: C.fg, fontSize: 12, flexWrap: "wrap" }, String(v)),
  ];
  if (tag) cells.push(pill(tag, tagColor || { bg: "#f3f4f6", fg: C.muted }, { marginLeft: 6, fontSize: 10 }));
  return row(cells, { marginTop: 3, alignItems: "flex-start" });
}

function box(children) {
  return col(children, { border: `1px solid ${C.border}`, borderRadius: 8, backgroundColor: C.boxBg, paddingTop: 9, paddingBottom: 9, paddingLeft: 10, paddingRight: 10, marginBottom: 8 });
}

// --- block renderers (keyed by block.type) -------------------------------------------------------
const BLOCKS = {
  // An inbound/outbound HTTP request: method pill + route, then key/value rows (identity, body, …).
  req: (b) => box([
    row([txt("REQUEST", { fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: 1 })]),
    row([pill(b.method, methodColor(b.method)), txt(b.route, { marginLeft: 7, fontSize: 12, color: C.fg, fontWeight: 700, flexWrap: "wrap" })], { marginTop: 5 }),
    ...(b.rows || []).map(kvRow),
  ]),
  // The real handler response: a status pill coloured by class + rows (body message, …).
  res: (b) => box([
    row([
      txt("RESPONSE", { fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: 1 }),
      pill(b.statusCode, statusColor(b.statusCode), { marginLeft: 8 }),
      txt(okStatus(b.statusCode) ? "success" : "rejected", { marginLeft: 6, fontSize: 11, color: C.muted }),
    ]),
    ...(b.rows || []).map(kvRow),
  ]),
  // A labelled key/value list — used for the projection diff (kept vs dropped fields).
  kv: (b) => box([
    ...(b.heading ? [row([txt(b.heading, { fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: 1 })])] : []),
    ...(b.rows || []).map(kvRow),
  ]),
  // A DOM crop (a filmstrip frame), captioned. `src` is a PNG data URI; w/h its intrinsic size.
  frame: (b) => {
    const dw = Math.min(b.w, CONTENT);
    const dh = Math.round((b.h * dw) / b.w);
    return col([
      ...(b.label ? [txt(b.label, { fontSize: 12, color: C.muted, marginBottom: 4 })] : []),
      { type: "img", props: { src: b.src, width: dw, height: dh, style: { display: "flex" } } },
    ], { marginBottom: 4 });
  },
  // A connector between frames — the gesture + the outbound verb/body it emitted.
  step: (b) => row([pill(b.text, { bg: "#eef2ff", fg: C.accent }, { alignSelf: "center", fontSize: 11 })], { justifyContent: "center", marginTop: 8, marginBottom: 8 }),
  // A muted caption.
  note: (b) => txt(b.text, { fontSize: 11, color: C.muted, marginTop: 2, flexWrap: "wrap" }),
};

/**
 * Render an evidence model to a PNG buffer.
 * @param {object} model { tag:'BEHAVIOR'|'SERVER'|'LOGIC', id, title, blocks:[{type,...}] }
 */
export async function renderEvidence(model) {
  const tagColor = TAG[model.tag] || TAG.LOGIC;
  const header = col([
    row([
      pill(model.tag, tagColor),
      txt(`${model.id}  ${model.title}`, { marginLeft: 8, fontSize: 13, fontWeight: 700, color: C.fg, flexWrap: "wrap" }),
    ]),
    // The honesty caption: this image is a view of the run, not the thing that decides pass/fail.
    txt("evidence rendered from the real run — the coded verify() is the gate", { fontSize: 11, color: C.faint, marginTop: 4, marginBottom: 12, flexWrap: "wrap" }),
  ]);
  const blocks = (model.blocks || []).map((b) => (BLOCKS[b.type] || BLOCKS.note)(b));
  const card = col([header, ...blocks], { width: WIDTH, paddingTop: PAD, paddingBottom: PAD, paddingLeft: PAD, paddingRight: PAD, backgroundColor: "#fff", fontFamily: FONT_FAMILY });
  return rasterize(card, WIDTH);
}

// A coded case opts into a gallery evidence artifact by exporting `evidence()` — an async that drives
// its REAL run and returns the model above. Both the gated runner and the refresh script produce the
// PNG the same way: run the case's evidence(), render it.
export const hasEvidence = (testCase) => typeof testCase.evidence === "function";
export async function produceEvidence(testCase) {
  return renderEvidence(await testCase.evidence());
}
