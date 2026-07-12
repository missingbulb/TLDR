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
import { fileURLToPath, pathToFileURL } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { openForSnapshot } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(HERE, "..", "..", "..", "..", "extension");
const FONT_DIR = path.join(HERE, "fonts");

const FONT_FAMILY = "Liberation Sans"; // a deterministic, metric-stable stand-in for the panel's sans-serif stack
const FONTS = [
  { name: FONT_FAMILY, data: fs.readFileSync(path.join(FONT_DIR, "LiberationSans-Regular.ttf")), weight: 400, style: "normal" },
  { name: FONT_FAMILY, data: fs.readFileSync(path.join(FONT_DIR, "LiberationSans-Bold.ttf")), weight: 700, style: "normal" },
  { name: FONT_FAMILY, data: fs.readFileSync(path.join(FONT_DIR, "LiberationSans-Italic.ttf")), weight: 400, style: "italic" },
];

// The fixed width the side panel / options page render at (the real panel is resized by Chrome; a
// fixed width makes the snapshot deterministic). The body's 12px padding lives in sidepanel.css.
const WIDTH = 360;

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

// Load + parse a surface's stylesheet (memoized). satori has no CSS engine, so we fold the whole real
// CSS onto the rendered DOM before drawing. Each surface uses its OWN stylesheet, mirroring its HTML
// <link>: the side panel and options page share sidepanel.css; the toolbar menu uses category-menu.css.
const SHEETS = new Map();
function loadSheet(cssFileName) {
  const cached = SHEETS.get(cssFileName);
  if (cached) return cached;
  const css = fs.readFileSync(path.join(CLIENT, "src", cssFileName), "utf8");
  const RULES = parseCssRules(stripAtRulesAndComments(css));
  // The light-theme custom properties from :root, e.g. { "--fg": "#1a1a1a", ... }.
  const VARS = {};
  const root = RULES.find((r) => r.selector === ":root");
  if (root) {
    for (const decl of root.body.split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      if (prop.startsWith("--")) VARS[prop] = decl.slice(i + 1).trim();
    }
  }
  const sheet = { RULES, VARS, BODY_RULE: RULES.find((r) => r.selector === "body") };
  SHEETS.set(cssFileName, sheet);
  return sheet;
}

// The stylesheet file a surface loads (mirrors its HTML <link>): the toolbar menu has its own; the
// side panel and options page share sidepanel.css.
function cssFor(surface) {
  return surface === "menu" ? "category-menu.css" : "sidepanel.css";
}

// The link-hover tooltip's stylesheet is a JS string in the SHIPPED module (the content script injects
// it into its shadow root — there is no .css file for it), so its sheet is built from that same export:
// single source, the snapshot can't drift from what the content script actually injects. Declarations
// that only place the popup over the host page — position:fixed / z-index / left / top — plus the
// paint-inert pointer-events are dropped: they're meaningless in a standalone crop, and satori doesn't
// lay out `position: fixed`.
let TOOLTIP_SHEET;
async function loadTooltipSheet() {
  if (TOOLTIP_SHEET) return TOOLTIP_SHEET;
  const { TOOLTIP_STYLE } = await import(pathToFileURL(path.join(CLIENT, "src", "hover-tooltip.mjs")).href);
  const DROP = new Set(["position", "z-index", "left", "top", "pointer-events"]);
  const RULES = parseCssRules(stripAtRulesAndComments(TOOLTIP_STYLE)).map(({ selector, body }) => ({
    selector,
    body: body
      .split(";")
      .filter((decl) => !DROP.has(decl.slice(0, decl.indexOf(":")).trim()))
      .join(";"),
  }));
  TOOLTIP_SHEET = { RULES, VARS: {}, BODY_RULE: null };
  return TOOLTIP_SHEET;
}

// The sheet a case's surface folds onto its DOM: the linkHover surface uses the shipped tooltip style
// string; every extension-page surface loads its real .css file.
function sheetFor(testCase) {
  return testCase.surface === "linkHover" ? loadTooltipSheet() : loadSheet(cssFor(testCase.surface));
}

// Replace var(--name) / var(--name, fallback) with the resolved value (or the fallback), against the
// given variable map (a sheet's :root vars, optionally overlaid with the active category's tokens).
function resolveVars(value, vars) {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fallback) =>
    (vars[name] ?? (fallback ? fallback.trim() : "")).trim()
  );
}

// Per-category design tokens (issue #25): each extension/src/categories/<id>/<id>.css scopes its colour
// tokens to `body[data-category="<id>"] { --separator: …; --accent: … }`. satori has no CSS engine and
// resolves vars only from :root, so read those per-category token blocks here and, at render time,
// overlay the ACTIVE category's tokens (from body[data-category]) onto the base vars — so a snapshot
// shows the category's separators/accent exactly as the real browser cascades them. (Category CSS is
// tokens-only by contract — enforced by the design-encapsulation requirement leaf — so nothing else
// needs modelling.)
const CATEGORIES_DIR = path.join(CLIENT, "src", "categories");
const CATEGORY_VARS = (() => {
  const out = {};
  let entries;
  try {
    entries = fs.readdirSync(CATEGORIES_DIR, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const cssPath = path.join(CATEGORIES_DIR, ent.name, `${ent.name}.css`);
    if (!fs.existsSync(cssPath)) continue;
    for (const { selector, body } of parseCssRules(stripAtRulesAndComments(fs.readFileSync(cssPath, "utf8")))) {
      const m = /data-category="([^"]+)"/.exec(selector);
      if (!m) continue;
      const vars = (out[m[1]] ||= {});
      for (const decl of body.split(";")) {
        const i = decl.indexOf(":");
        if (i < 0) continue;
        const prop = decl.slice(0, i).trim();
        if (prop.startsWith("--")) vars[prop] = decl.slice(i + 1).trim();
      }
    }
  }
  return out;
})();

// A sheet's base vars overlaid with the active category's tokens (body[data-category] on the DOM).
function effectiveVars(bodyEl, baseVars) {
  const cat = bodyEl?.dataset?.category;
  return cat && CATEGORY_VARS[cat] ? { ...baseVars, ...CATEGORY_VARS[cat] } : baseVars;
}

// Fold a sheet's rules onto the <body> subtree as inline styles (var()s resolved against the effective
// vars). The element's own inline style is appended last so a case's action (an inline override) wins.
function inlineCss(bodyEl, { RULES, BODY_RULE }, vars) {
  for (const { selector, body } of RULES) {
    if (selector === "body" || selector === ":root") continue;
    let matched;
    try {
      matched = bodyEl.querySelectorAll(selector);
    } catch {
      continue; // a selector jsdom can't evaluate — skip
    }
    for (const el of matched) el.setAttribute("style", `${resolveVars(body, vars)};${el.getAttribute("style") || ""}`);
  }
  if (BODY_RULE) bodyEl.setAttribute("style", `${resolveVars(BODY_RULE.body, vars)};${bodyEl.getAttribute("style") || ""}`);
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
function prepareBody(session, sheet) {
  const body = session.document.body;
  // Chrome's UA stylesheet hides `[hidden]` elements (display:none); satori has no UA stylesheet,
  // so remove them to match what Chrome actually paints (the panel toggles the composer and status
  // via the `hidden` attribute). `disabled` elements, by contrast, are still painted (greyed), so
  // they stay.
  for (const el of body.querySelectorAll("[hidden]")) el.remove();
  // Resolve var()s against the sheet's :root tokens overlaid with the active category's tokens, so a
  // page rendered under body[data-category="spoiler"] shows spoiler's separators/accent (issue #25).
  inlineCss(body, sheet, effectiveVars(body, sheet.VARS));
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
// so Chrome paints it white — match that, so there are no transparent corners).
async function rasterize(vdom, width) {
  const svg = await satori(vdom, { width, fonts: FONTS });
  return new Resvg(svg, { font: { loadSystemFonts: false }, background: "#ffffff" }).render().asPng();
}

// Render one `dom` case to a PNG buffer: the case's real DOM (via the harness) + the real CSS,
// rasterized as the whole <body> at the fixed panel width.
export async function renderCaseImage(testCase) {
  const session = await openForSnapshot(testCase);
  try {
    const vdom = toVDom(prepareBody(session, await sheetFor(testCase)));
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
    const body = prepareBody(session, await sheetFor(testCase));
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
