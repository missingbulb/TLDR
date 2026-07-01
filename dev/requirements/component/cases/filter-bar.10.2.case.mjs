// 10.2 — The panel renders the segmented category filter bar (All + one tab per known category, from
// the shared list), with "All" selected by default (issue #25). Cropped to the filter bar itself so
// an unrelated panel change doesn't churn this golden. An empty page still renders the bar (it's a
// commentable page), and the default filter is "All", shown as the filled/active tab.
"use strict";

export default {
  selector: ".filters",
  description: "the category filter bar (All + one tab per category) renders with All selected by default",
  tabUrl: "https://example.com/article",
  comments: [],
};
