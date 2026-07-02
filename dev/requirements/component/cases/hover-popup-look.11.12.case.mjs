// 11.12 — The hover popup's LOOK, pinned as an owner-approved image: a COMPACT dark card with the
// current category's label on top, the leading note's body (hard-capped with an ellipsis when it's too
// long — see this case's over-length body), and, on the meta line, the author plus the note's VOTE
// COUNT (▲ N). Driven through the REAL link-hover.mjs (the same hover the behavior leaves gesture
// through — surface "linkHover" routes openForSnapshot to the link-hover harness, which materializes
// the shadow-root tooltip), styled by the SHIPPED TOOLTIP_STYLE the content script injects — so the
// image moves when the popup's code/styles do. The body here deliberately EXCEEDS MAX_BODY_CHARS so the
// approved image shows the crop (…) rather than an unbounded wall of text.
"use strict";

export default {
  surface: "linkHover",
  selector: ".tldr-hover-tooltip",
  width: 220, // the popup's own max-width — crop at its natural size, not the panel's content width
  description: "the hover popup: a compact dark card with the category, the (cropped) note body, the author, and the vote count",
  links: { link1: "https://example.com/article" },
  currentCategory: "tldr",
  onMessage: () => ({
    comment: {
      commentId: "c-top",
      body: "The gist: a concise, community-written summary of the linked page — long enough that the popup crops it with an ellipsis instead of growing without bound.",
      authorName: "Ada",
      voteCount: 42,
    },
  }),
};
