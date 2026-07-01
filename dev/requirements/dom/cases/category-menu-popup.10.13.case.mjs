// 10.13 — The toolbar-icon category menu POPUP, verified VISUALLY (issue #25). A `dom` snapshot of the
// `menu` surface: the real category-menu.html/.mjs rendered with its own category-menu.css, showing the
// "Show" heading and one button per category (TLDR / Spoiler / Chitchat) built from the shared list.
// This is the visual expected-vs-actual for the popup the icon opens; the click behaviour (sets the
// current category + opens the pane) is the sibling behavior leaf 10.7.
"use strict";

export default {
  surface: "menu",
  description: "the toolbar category menu popup lists the categories to choose from",
  tabUrl: "https://example.com/article",
};
