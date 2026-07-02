// 11.12 — The hover popup's LOOK, pinned as an owner-approved image: a compact dark card with the
// current category's label on top, the leading note's body, and its author below. Driven through the
// REAL link-hover.mjs (the same hover the behavior leaves gesture through — surface "linkHover" routes
// openForSnapshot to the link-hover harness, which materializes the shadow-root tooltip), styled by the
// SHIPPED TOOLTIP_STYLE the content script injects — so the image moves when the popup's code/styles do.
"use strict";

export default {
  surface: "linkHover",
  selector: ".tldr-hover-tooltip",
  width: 280, // the popup's own max-width — crop at its natural size, not the panel's content width
  description: "the hover popup: a dark card naming the category, the leading note's body, and its author",
  links: { link1: "https://example.com/article" },
  currentCategory: "tldr",
  onMessage: () => ({
    comment: {
      commentId: "c-top",
      body: "The gist: a concise, community-written summary of the linked page.",
      authorName: "Ada",
      voteCount: 5,
    },
  }),
};
