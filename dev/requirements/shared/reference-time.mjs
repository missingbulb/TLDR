// The single, pinned "now" the executable-requirements tests run against.
//
// Why this exists: the side panel renders some output relative to the current clock — a note's
// meta line reads "just now" / "Nm ago" / "Nh ago" for a recent note and the absolute locale date
// for an older one (sidepanel.mjs `timeAgo`). If the tests read the real clock, a golden authored
// today would rot tomorrow ("30m ago" becomes "31m ago"; "just now" becomes "5m ago"), and the
// exact-match snapshot comparison would go red through no code change. See the date-pinning rule in
// .claudinite/tasks/testingPractices.md.
//
// sidepanel.mjs's timeAgo reads `Date.now()` directly (it is not threaded a `now`, unlike the
// reference project's render). So the harness PINS `Date.now()` to this instant while it drives the
// real code, and restores it after — the harness-level equivalent of threading a reference time.
// Keep ONE copy of the instant here so every entry point (the dom snapshot runner, the behavior
// runner, every case) shares it; change it in one place, not several.
//
// The pinned instant is 2026-06-28T12:00:00Z. WHEN AUTHORING A CASE: a note you want to read as a
// relative time ("just now"/"Nm ago"/"Nh ago") must be dated within 24h BEFORE this instant; a note
// you want to read as an absolute date must be dated more than 24h before it.
"use strict";

export const REFERENCE_NOW_MS = Date.UTC(2026, 5, 28, 12, 0, 0); // 2026-06-28T12:00:00Z
export const REFERENCE_NOW = new Date(REFERENCE_NOW_MS);
