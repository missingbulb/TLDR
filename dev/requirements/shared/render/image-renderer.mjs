// Renders a `dom` case to a PNG via satori (HTML/CSS-subset -> SVG, no browser) and resvg
// (SVG -> PNG) — a deterministic, faithful approximation of the panel, driven by the SHIPPED code and
// styles. This is the owner-approved expected for a `dom` leaf: the image embedded in the
// requirements gallery, compared pixel-exact.
//
// The DOM rendered here is the panel's REAL output: the harness builds it by running the real
// sidepanel.mjs / options.mjs against faked inputs (see harness.mjs), so there is NO hand-maintained
// copy of the markup — change a view and the images move with it.
//
// satori has no CSS engine (it reads only inline styles), so we fold the WHOLE real sidepanel.css
// onto the rendered DOM before drawing: parse it into rules, match each against the DOM with jsdom,
// and inline every declaration. Two wrinkles beyond the reference project's renderer, because TLDR's
// stylesheet uses them: CSS custom properties (`var(--fg)`) are resolved from :root, and the `font:`
// shorthand is expanded — satori understands neither. Interaction rules (:hover/:active) match
// nothing in a static tree and are skipped; the dark-mode @media block is dropped (satori has no
// media context, so the panel renders in its default light theme, as Chrome shows it by default).
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { openForSnapshot } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(HERE, "..", "..", "..", "..", "client");
const FONT_DIR = path.join(HERE, "fonts");

// Exported so the evidence renderer (evidence-renderer.mjs) rasterizes with the SAME bundled font +
// pinned resvg settings — one deterministic rasterizer for every artifact in the gallery.
export const FONT_FAMILY = "Liberation Sans"; // a deterministic, metric-stable stand-in for the panel's sans-serif stack
export const FONTS = [
  { name: FONT_FAMILY, data: fs.readFileSync(path.join(FONT_DIR, "LiberationSans-Regular.ttf")), weight: 400, style: "normal" },
  { name: FONT_FAMILY, data: fs.readFileSync(path.join(FONT_DIR, "LiberationSans-Bold.ttf")), weight: 700, style: "normal" },
  { name: FONT_FAMILY, data: fs.readFileSync(path.join(FONT_DIR, "LiberationSans-Italic.ttf")), weight: 400, style: "italic" },
];

// The fixed width the side panel / options page render at (the real panel is resized by Chrome; a
// fixed width makes the snapshot deterministic). The body's 12px padding lives in sidepanel.css.
const WIDTH = 360;

const CSS = fs.readFileSync(path.join(CLIENT, "src", "sidepanel.css"), "utf8");

// --- CSS parsing (flat rules; @media blocks stripped; :root variables resolved) -----------------

// Remove every `@media ... { ... }` block (brace-balanced) so the flat parser below — which assumes
// no nesting — never sees the dark-theme :root override. Also strips comments.
function stripAtRulesAndComments(css) {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let result = "";
  for (let i = 0; i < out.length; ) {
    if (out.startsWith("@media", i)) {
      // skip to the matching close brace of this at-rule
      let depth = 0;
      let j = out.indexOf("{", i);
      if (j === -1) break;
      for (let k = j; k < out.length; k++) {
        if (out[k] === "{") depth++;
        else if (out[k] === "}") {
          depth--;
          if (depth === 0) { i = k + 1; break; }
        }
        if (k === out.length - 1) i = out.length;
      }
    } else {
      result += out[i];
      i++;
    }
  }
  return result;
}

// Flat CSS -> [{ selector, body }] (comma-separated selectors split out).
function parseCssRules(css) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]+)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[2].trim();
    for (const sel of m[1].split(",")) rules.push({ selector: sel.trim(), body });
  }
  return rules;
}

const RULES = parseCssRules(stripAtRulesAndComments(CSS));

// The light-theme custom properties from :root, e.g. { "--fg": "#1a1a1a", ... }.
const VARS = (() => {
  const map = {};
  const root = RULES.find((r) => r.selector === ":root");
  if (root) {
    for (const decl of root.body.split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      if (prop.startsWith("--")) map[prop] = decl.slice(i + 1).trim();
    }
  }
  return map;
})();

// Replace var(--name) / var(--name, fallback) with the resolved value (or the fallback).
function resolveVars(value) {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fallback) =>
    (VARS[name] ?? (fallback ? fallback.trim() : "")).trim()
  );
}

const BODY_RULE = RULES.find((r) => r.selector === "body");

// Fold sidepanel.css onto the panel's <body> subtree as inline styles (var()s resolved). The
// element's own inline style is appended last so a case's action (e.g. an inline override) wins.
function inlineCss(bodyEl) {
  for (const { selector, body } of RULES) {
    if (selector === "body" || selector === ":root") continue;
    let matched;
    try {
      matched = bodyEl.querySelectorAll(selector);
    } catch {
      continue; // a selector jsdom can't evaluate — skip
    }
    for (const el of matched) el.setAttribute("style", `${resolveVars(body)};${el.getAttribute("style") || ""}`);
  }
  if (BODY_RULE) bodyEl.setAttribute("style", `${resolveVars(BODY_RULE.body)};${bodyEl.getAttribute("style") || ""}`);
}

// --- inline-style string -> satori style object -------------------------------------------------

const camel = (p) => p.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function coerceValue(v) {
  v = v.trim();
  if (/^-?\d+(\.\d+)?px$/.test(v)) return parseFloat(v);
  if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  return v;
}

// satori validates `display` against a fixed set; drop an unsupported value (the >1-child rule below
// still forces flex where structurally required).
const SATORI_DISPLAY = new Set(["flex", "block", "contents", "none", "-webkit-box"]);

// Shorthand/composite properties satori parses as STRINGS — never numeric-coerce these (e.g.
// `border: 0` must stay "0", not the number 0, which satori would `.trim()` and crash on).
const STRING_PROPS = new Set(["border", "outline", "background", "transition", "boxShadow", "textDecoration", "borderRadius"]);

function styleObject(styleAttr) {
  const out = {};
  for (const decl of (styleAttr || "").split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) continue;
    // Expand the `font:` shorthand satori doesn't parse: `<size>[/<line-height>] <family...>`.
    if (prop === "font") {
      const fm = /^(?:[\w-]+\s+)*?(\d+(?:\.\d+)?px)(?:\s*\/\s*([\d.]+))?\s+/.exec(value);
      if (fm) {
        out.fontSize = parseFloat(fm[1]);
        if (fm[2]) out.lineHeight = parseFloat(fm[2]);
      }
      continue;
    }
    const key = camel(prop);
    if (key === "display" && !SATORI_DISPLAY.has(value)) continue;
    out[key] = STRING_PROPS.has(key) ? value : coerceValue(value);
  }
  return out;
}

const FLEXY_DISPLAY = ["flex", "none", "contents"];

// jsdom element -> satori element tree. Tag is irrelevant to satori (it lays boxes out from styles),
// so everything becomes a div; text nodes become string children (whitespace collapsed).
function toVDom(el) {
  const style = styleObject(el.getAttribute("style"));
  // Preserve text verbatim under a pre/pre-wrap element (the options textarea's one-host-per-line
  // value, a multi-line comment body); collapse whitespace everywhere else.
  const pre = /pre/.test(style.whiteSpace || "");
  const children = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      const t = pre ? node.textContent : node.textContent.replace(/\s+/g, " ").trim();
      if (t) children.push(t);
    } else if (node.nodeType === 1) {
      children.push(toVDom(node));
    }
  }
  // satori's one structural requirement: any box laying out child BOXES needs an explicit
  // flex/none/contents display; a lone text child is exempt. The panel stacks vertically, so default
  // those to a column flex (the css's own flex rules already satisfy the ones that need row).
  const loneTextChild = children.length === 1 && typeof children[0] === "string";
  if (children.length > 0 && !loneTextChild && !FLEXY_DISPLAY.includes(style.display)) {
    style.display = "flex";
    if (!style.flexDirection) style.flexDirection = "column";
  }
  const childProp = children.length === 0 ? undefined : children.length === 1 ? children[0] : children;
  return { type: "div", props: { style, children: childProp } };
}

// Fold the real CSS onto the panel's DOM and project textarea values, returning <body> ready to
// rasterize. Shared by the full-panel (`dom`) and cropped (`component`) renders, so BOTH go through
// the exact same real DOM + real styles — a crop is only a different root element, never a
// re-implementation of the markup.
function prepareBody(session) {
  const body = session.document.body;
  // Chrome's UA stylesheet hides `[hidden]` elements (display:none); satori has no UA stylesheet,
  // so remove them to match what Chrome actually paints (the panel toggles the composer and status
  // via the `hidden` attribute). `disabled` elements, by contrast, are still painted (greyed), so
  // they stay.
  for (const el of body.querySelectorAll("[hidden]")) el.remove();
  inlineCss(body);
  // A textarea's text is its `.value` property (and an empty one shows its placeholder) — neither
  // is a child text node, so satori would draw it empty. Project what the user sees: the live value
  // (white-space preserved — e.g. the options page's seeded denylist, one host per line, 6.1), or
  // the placeholder prompt in a muted tone when empty (the composer's "Add a tl;dr note…").
  for (const ta of body.querySelectorAll("textarea")) {
    if (ta.value) {
      ta.textContent = ta.value;
      ta.style.whiteSpace = "pre-wrap";
    } else if (ta.getAttribute("placeholder")) {
      ta.textContent = ta.getAttribute("placeholder");
      ta.style.color = "#9ca3af"; // a muted placeholder tone (Chrome paints the prompt greyed)
    }
  }
  return body;
}

// Rasterize a satori vdom at a fixed width on a white background (the panel body has no background,
// so Chrome paints it white — match that, so there are no transparent corners). Exported so the
// evidence renderer shares the exact same deterministic satori→resvg path.
export async function rasterize(vdom, width) {
  const svg = await satori(vdom, { width, fonts: FONTS });
  return new Resvg(svg, { font: { loadSystemFonts: false }, background: "#ffffff" }).render().asPng();
}

// Render one `dom` case to a PNG buffer: the case's real DOM (via the harness) + the real CSS,
// rasterized as the whole <body> at the fixed panel width.
export async function renderCaseImage(testCase) {
  const session = await openForSnapshot(testCase);
  try {
    const vdom = toVDom(prepareBody(session));
    Object.assign(vdom.props.style, {
      width: WIDTH,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      fontFamily: FONT_FAMILY,
      backgroundColor: "#fff",
    });
    return rasterize(vdom, WIDTH);
  } finally {
    session.close();
  }
}

// The panel's CONTENT width — the width an element actually lays out at inside the panel (the fixed
// WIDTH minus the body's 12px padding each side). A cropped element is rendered at this width so its
// text wraps EXACTLY as it does in the full panel.
const COMPONENT_WIDTH = WIDTH - 24;
// The panel's body padding. A crop is FRAMED with it (all sides) so the element sits exactly as it
// does in the panel — same width, same margin — with a little breathing room, rather than bleeding
// edge-to-edge. So the image shows "how the whole thing looks in place", not a bare fragment; the
// framed width equals the full panel width, so a crop and a `dom` render line up side by side.
const COMPONENT_PADDING = 12;

// Render a `component` case: the SAME real DOM + real CSS as a `dom` render, but rasterize ONLY the
// element `testCase.selector` names (e.g. `li.comment`, `.comments`), FRAMED with the panel's body
// padding — a faithful CROP of the panel. Because it's driven through the real render, the crop can
// never drift from what the panel paints; because it excludes the surrounding chrome, an unrelated
// change (the header title, the composer) leaves it byte-identical, so the requirement it pins isn't
// re-approved for a change it doesn't test.
export async function renderComponentImage(testCase) {
  if (!testCase.selector) {
    throw new Error(`component case "${testCase.name}" must set a \`selector\` (the element to crop)`);
  }
  const session = await openForSnapshot(testCase);
  try {
    const body = prepareBody(session);
    const target = body.querySelector(testCase.selector);
    if (!target) {
      throw new Error(`component case "${testCase.name}": selector "${testCase.selector}" matched no element`);
    }
    const cropWidth = testCase.width ?? COMPONENT_WIDTH;
    const inner = toVDom(target);
    Object.assign(inner.props.style, { width: cropWidth, boxSizing: "border-box" });
    // The cropped element inherits font/colour from <body> in real CSS; satori doesn't cascade from an
    // ancestor we're not rendering, so put the body's inherited text properties on the FRAME so they
    // cascade to the element (whose own inlined styles still win).
    const inherited = styleObject(body.getAttribute("style"));
    const framedWidth = cropWidth + COMPONENT_PADDING * 2;
    const frame = {
      type: "div",
      props: {
        style: {
          ...(inherited.fontSize != null && { fontSize: inherited.fontSize }),
          ...(inherited.lineHeight != null && { lineHeight: inherited.lineHeight }),
          ...(inherited.color != null && { color: inherited.color }),
          display: "flex",
          flexDirection: "column",
          padding: COMPONENT_PADDING,
          width: framedWidth,
          boxSizing: "border-box",
          fontFamily: FONT_FAMILY,
          backgroundColor: "#fff",
        },
        children: inner,
      },
    };
    return rasterize(frame, framedWidth);
  } finally {
    session.close();
  }
}
