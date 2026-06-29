// Kind: behavior — a user gesture whose EFFECT a static snapshot can't show (typing a note and
// pressing Post, saving the denylist): the case drives the real UI through the harness and asserts
// the resulting DOM mutation + what the UI asked the browser/network to do. No golden; the
// owner-approved expected is the coded verify() in the case. Runner: behavior/behavior.test.mjs.
"use strict";

export default { snapshot: false };
