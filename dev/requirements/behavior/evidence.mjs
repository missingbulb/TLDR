// Behavior filmstrip evidence: drive the REAL gesture, capture the DOM at each step as a real
// component crop, and read the asserted facts (count, aria-pressed, and the OUTBOUND request each
// click emitted — verb + body) off the same run's session.fetchLog. Nothing is mocked or hand-typed;
// the frames ARE the panel's DOM and the request rows ARE what the client sent.
//
// Imported lazily (only inside a case's evidence()), so loading the case list for the coverage gate
// never pulls in jsdom / satori. The frames come straight from the component-crop pipeline.
"use strict";

import { PNG } from "pngjs";
import { open } from "../shared/render/harness.mjs";
import { renderComponentImage } from "../shared/render/image-renderer.mjs";

const VOTE_BTN = "li.comment .vote";
const VOTE_COUNT = "li.comment .vote-count";
// Normalize a captured vote URL to its route shape (the commentId is run-specific noise).
const routeOf = (url) => new URL(url).pathname.replace(/\/[^/]+\/vote$/, "/{id}/vote");

// Drive the vote toggle (cast then remove) and return a BEHAVIOR filmstrip model: a crop per state,
// with the emitted verb + request body between them. `clicks` is how many times to toggle (2 = cast
// then remove; 1 = just cast).
export async function voteFilmstrip({ id, title, baseCase, clicks = 2 }) {
  // --- Capture pass: derive the asserted facts (state + outbound requests) from the real run ---
  const cap = await open("sidepanel", baseCase);
  const readState = () => ({
    pressed: cap.document.querySelector(VOTE_BTN).getAttribute("aria-pressed"),
    count: cap.document.querySelector(VOTE_COUNT).textContent,
  });
  const states = [readState()];
  const requests = [];
  for (let i = 0; i < clicks; i++) {
    const before = cap.fetchLog.length;
    cap.document.querySelector(VOTE_BTN).click();
    await cap.settle();
    requests.push(cap.fetchLog.slice(before).find((c) => /\/vote$/.test(c.url)));
    states.push(readState());
  }
  cap.close();

  // --- Render pass: one faithful crop per state, via the real component renderer ---
  const clickN = (n) => async (s) => {
    for (let i = 0; i < n; i++) {
      s.document.querySelector(VOTE_BTN).click();
      await s.settle();
    }
  };
  const frameOf = (buf) => {
    const p = PNG.sync.read(buf);
    return { src: `data:image/png;base64,${buf.toString("base64")}`, w: p.width, h: p.height };
  };
  const crops = [];
  for (let i = 0; i < states.length; i++) {
    crops.push(frameOf(await renderComponentImage({ ...baseCase, name: `${id}:${i}`, selector: "li.comment", action: i ? clickN(i) : undefined })));
  }

  const labels = ["initial", "after 1st click", "after 2nd click", "after 3rd click"];
  const blocks = [];
  states.forEach((st, i) => {
    blocks.push({ type: "frame", label: `${labels[i]}  ·  count ${st.count}  ·  aria-pressed=${st.pressed}`, ...crops[i] });
    const r = requests[i];
    if (r) blocks.push({ type: "step", text: `click → ${r.method} ${routeOf(r.url)}  ·  body ${r.body}` });
  });
  return { tag: "BEHAVIOR", id, title, blocks };
}
