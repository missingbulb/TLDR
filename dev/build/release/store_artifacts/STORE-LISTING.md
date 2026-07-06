# Chrome Web Store listing — copy-paste answers

Everything the developer dashboard asks for when creating/updating the TLDR listing,
pre-written — the repo-side source of truth for the initial submission and every resubmission.
The submission interleaves with the Google/AWS setup, so the ordered checklist is the
[go-live runbook](../../../docs/go-live-runbook.md) (Phases 1 and 6–7), which fills the
dashboard **from this file**. Keep this file current: a PR that changes the manifest's
permissions updates the justification table below in the same PR (canon release guide, "When a
change touches the extension's permissions").

## Store listing tab

**Name** (from the uploaded manifest): `TLDR — community notes`

**Summary** (from the manifest `description`, ≤132 chars):

> Read and post community tl;dr notes attached to any web page.

**Detailed description** (draft — review before pasting):

```
Get community tl;dr notes for any page on the web.

TLDR adds a side panel that shows short community notes ("tl;dr"s) attached to the page you're
viewing, and lets you post your own.

• Open the side panel from the toolbar button — the notes for the current page load instantly,
  and refresh as you switch tabs or the page navigates.
• Reading is anonymous: no account, no sign-in, nothing identifying sent.
• Posting takes one Google sign-in, used only to attribute your note and prevent abuse.
• Nothing runs in the background: the extension talks to the service only while the side panel
  is open, and only for the active tab.
• A per-site off switch (and a built-in denylist) keeps it away from pages where you don't
  want it.

Notes are public community content — read what others took away from a page, and leave the
tl;dr you wish you'd found.
```

**Category:** suggested *Social & Communication* (confirm against the dashboard's current
category list). **Language:** English (United States).

**Graphic assets:** store icon (128×128) = `client/icons/icon128.png` — ⚠️ the committed icons
are placeholders; replace them before submission (`client/README.md`). Screenshot =
`chrome-store-screenshot-1280x800.png` (beside this file).

**Additional fields:**

- Official URL / homepage: `https://github.com/missingbulb/TLDR`
- Support URL: `https://github.com/missingbulb/TLDR/issues`

## Privacy practices tab

**Single purpose description:**

> Show and post short community "tl;dr" notes attached to the web page the user is currently
> viewing.

**Permission justifications** (each grounded in actual code use):

| Permission | Justification to paste |
|---|---|
| `identity` | Sign the user in with Google via `launchWebAuthFlow` to obtain an ID token, only when they choose to post a note. |
| `sidePanel` | The entire UI is a side panel listing notes for the current page and letting the user post one. |
| `storage` | The user's per-site on/off list (`chrome.storage.sync`) + a short-lived sign-in token cache (`chrome.storage.session`). No browsing data. |
| `tabs` | Read the active tab's URL to fetch the notes for the page being viewed, and refresh on tab switch. |
| `webNavigation` | Detect in-page (SPA) navigations so the list refreshes when the URL changes without a full reload. |
| `scripting` | Registers the optional link-hover content script dynamically (`chrome.scripting.registerContentScripts`), and only after the user grants host access at runtime. No static content scripts — nothing is injected without opt-in. |
| Optional host permissions (`http://*/*`, `https://*/*`) | Requested at runtime via `chrome.permissions.request`, per explicit user opt-in, to enable the link-hover notes preview; nothing is granted at install time. |

(The `scripting` and optional-host rows are drafted from the code — review the wording before
pasting.)

**Remote code use:** No — all code ships in the package (plain ES modules; no bundler, no CDN
resources, no eval).

**Data usage:** declare **Authentication information** (Google sign-in) + **User-generated
content** (note text); check the three certifications (no selling, no unrelated use, no
creditworthiness use). Raw email is never stored (only a salted one-way hash), so don't declare
email collection.

**Privacy policy URL:**

```
https://missingbulb.github.io/TLDR/privacy/
```

## Notes for the Google reviewer (paste into the review notes field if offered)

```
Reading requires no account: open the side panel from the toolbar button on any normal http(s)
page to see its notes. Posting requires signing in with a Google account (the extension obtains
an ID token via Chrome's identity API). The extension talks only to the project's own API, and
only while the side panel is open, for the active tab; notes are public community content.
```
