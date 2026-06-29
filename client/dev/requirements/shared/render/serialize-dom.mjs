// Serializes a rendered DOM subtree into a normalized, indented, deterministic TEXT representation —
// the `dom` kind's "actual", compared against a committed golden the owner approves.
//
// Why text, not pixels: the side panel is small and its requirements are about STRUCTURE, COPY, and
// SEMANTICS (which element, which class/state, which aria role, what text) — not sub-pixel layout.
// A serialized tree captures exactly those, stays readable in a PR diff (an owner can eyeball what
// changed), needs no rendering engine or binary artifacts, and still tracks the SHIPPED code: it is
// produced by running the real sidepanel.mjs/options.mjs and serializing what they built, so there
// is no hand-maintained copy of the markup. (When a project genuinely needs pixel fidelity, a
// pixel-snapshot kind is a separate, heavier addition — see the README's "rendering" section.)
//
// The representation deliberately captures only the attributes that carry UI meaning (id, class,
// roles, form affordances, the visibility/disabled flags, live values) so incidental noise (e.g.
// jsdom internals) never churns a golden, while a real change to any asserted property does.
"use strict";

// Attributes shown, in this fixed order, as `[name=value ...]`. Booleans (below) are shown bare.
const ATTR_ORDER = ["role", "type", "name", "for", "href", "title", "placeholder", "rows", "maxlength"];
// Reflected as bare flags when present/true.
const BOOLEAN_ATTRS = ["hidden", "disabled"];
// Elements whose live `.value` (user/seeded input, not the attribute) is part of the rendered state.
const VALUE_ELEMENTS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const collapse = (s) => s.replace(/\s+/g, " ").trim();

function selector(el) {
  let sel = el.tagName.toLowerCase();
  if (el.id) sel += `#${el.id}`;
  const cls = (el.getAttribute("class") || "").trim();
  if (cls) sel += "." + cls.split(/\s+/).join(".");
  return sel;
}

function attrs(el) {
  const parts = [];
  for (const name of ATTR_ORDER) {
    if (el.hasAttribute(name)) parts.push(`${name}=${JSON.stringify(collapse(el.getAttribute(name)))}`);
  }
  // aria-* attributes, sorted, after the fixed set (accessibility semantics are first-class here).
  const aria = el
    .getAttributeNames()
    .filter((n) => n.startsWith("aria-"))
    .sort();
  for (const name of aria) parts.push(`${name}=${JSON.stringify(collapse(el.getAttribute(name)))}`);
  // A form control's live value (the seeded denylist text, a typed note), if any.
  if (VALUE_ELEMENTS.has(el.tagName) && el.value) parts.push(`value=${JSON.stringify(collapse(el.value))}`);
  for (const name of BOOLEAN_ATTRS) {
    if (el.hasAttribute(name) || el[name.toLowerCase()] === true) parts.push(name);
  }
  return parts.length ? ` [${parts.join(" ")}]` : "";
}

// The element's DIRECT text (its own text-node children, joined + collapsed) — not descendants',
// which appear on their own lines.
function directText(el) {
  let text = "";
  for (const node of el.childNodes) if (node.nodeType === 3) text += node.textContent;
  return collapse(text);
}

function walk(el, depth, lines) {
  const indent = "  ".repeat(depth);
  const text = directText(el);
  lines.push(`${indent}${selector(el)}${attrs(el)}${text ? ` ${JSON.stringify(text)}` : ""}`);
  for (const child of el.children) walk(child, depth + 1, lines);
}

// Serialize `el` (typically document.body) to the golden text. Trailing newline so the file is a
// clean POSIX text file and an unchanged render yields no diff.
export function serializeDom(el) {
  const lines = [];
  walk(el, 0, lines);
  return lines.join("\n") + "\n";
}
