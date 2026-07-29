# Chrome Web Store appeal — "Red Potassium" (functionality could not be verified)

For item `cgfkbaigkiccdpnmmbfmookalaombhil` (**TLDR — community notes**). The appeal box is short, so
the text below is deliberately under 800 characters: a flow the reviewer can follow on a named site,
each step carrying the gotcha that would otherwise stall it. No narrative, no reassurance prose.

---

## Appeal text (797 characters — keep it under 800)

Red Potassium — the extension does work. To verify:

1. Go to cnn.com.
2. Click the TLDR icon. The FIRST click opens a small category chooser — pick "TLDR"; later clicks just open/close the panel.
3. The panel lists that page's notes. "No notes yet — be the first." is a successful fetch of an unannotated page, not an error.
4. Type a note and click Post. Sign in with Google when prompted — reading is anonymous, only posting needs an account; a dismissed prompt shows "Could not post — try again."
5. Reload: the note persists, and is served to every user on that URL.

Gotcha: TLDR is off by design on the Web Store listing, chrome:// and New Tab pages, and search engines (google.com, bing.com, duckduckgo.com ship denylisted). Testing there shows only "TLDR is off for this page."

---

## Notes (not pasted)

`cnn.com` is a safe worked example: plain `https`, not in either denylist layer, and article URLs
survive normalization intact. Re-check that before reusing this text if the default denylist changes.

Deliberately cut, to stay under the limit and keep every line load-bearing: the opt-in hover preview
(a reviewer verifying the listing's claims never reaches it), the Chrome 116 minimum (reviewers run
current Chrome), the panel-open-only fetching rationale, and the offer of a test account. Add a
screencast of steps 1–5 as an attachment rather than describing the flow twice.

Where each claim comes from, so the appeal stays checkable as the code moves:

| Claim | Source |
|---|---|
| Store + non-http(s) hard block; search engines seeded off | `extension/src/denylist.mjs` (`CODE_BLOCKED_HOSTS`, `DEFAULT_USER_DENYLIST`, `ALLOWED_SCHEMES`) |
| "TLDR is off for this page." | `extension/src/sidepanel.mjs` (`refresh` → `setStatus`) |
| First-run category popup, then open/close toggle | `extension/src/service-worker.mjs` (`reflectPopup`, `hasChosenCategory`, `action.onClicked`) |
| "No notes yet — be the first." | `extension/src/sidepanel.mjs` (empty-state render) |
| Reads anonymous; post is silent-token-first, interactive on 401 | `extension/src/api.mjs` (`postComment`), `extension/src/auth.mjs` (`getIdToken`) |
| "Could not post — try again." | `extension/src/sidepanel.mjs` (composer error path) |
| Only the store build points at production | `dev/docs/extension.md` (§ Configuration — `tldr-prod.zip`) |
