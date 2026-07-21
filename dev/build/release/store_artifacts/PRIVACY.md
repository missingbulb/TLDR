# TLDR — Privacy Policy

_Last updated: 2026-07-21_

TLDR ("the extension") lets signed-in users read and post short community notes ("tl;dr notes")
attached to the web page they are viewing. This policy explains exactly what the extension collects,
why, and what it never does.

## What we collect, and only when you act

The extension does **nothing in the background**. It fetches notes **only while the side panel is open**,
for the **active tab**, and only on normal `http(s)` pages you haven't disabled. With the panel closed it
sends no data at all.

- **Reading notes (no account needed).** When the side panel is open, the extension sends the **normalized
  URL of the current page** to our API to fetch that page's notes. Reading is anonymous — no account, no
  identifying header is sent. The URL is normalized first (tracking parameters such as `utm_*` are stripped;
  the page fragment `#…` is dropped) before it leaves your browser.
- **Posting a note (account needed).** To post, you sign in with Google. We use Google sign-in solely to
  obtain a verified identity token. When you submit a note we store:
  - the **note text** you wrote;
  - your **Google display name** and an opaque **Google account identifier** (`sub`), shown as the note's author;
  - the **normalized page URL** the note is attached to, and a timestamp;
  - a **salted, one-way hash of your verified email** — used only for abuse moderation. The hash cannot be
    reversed to your email, and it is **never** returned to anyone reading notes.

## What we never do

- We **never store or share your raw email address.** Only the irreversible salted hash is kept, and it is
  never included in any note shown to other users.
- We **do not sell or rent** your data, and we do not use it for advertising.
- We **do not track your browsing.** No page is contacted unless you have the panel open on it; closed-panel
  browsing generates no requests.
- We use **no analytics, ad networks, or third-party trackers** in the extension.

## Data stored in your browser

The extension keeps a small amount of data in Chrome's own storage:

- A **per-site on/off list** (the "denylist") in `chrome.storage.sync`, so you can disable the extension on
  chosen sites. Chrome may sync this across your devices via your Google account; it is not sent to us.
- A short-lived **sign-in token cache** in `chrome.storage.session`, cleared when the browser session ends.

## Who can see your notes

Notes are **public**: anyone using the extension on the same page sees the same notes, attached to your
Google display name. Do not post anything you wish to keep private.

## Data retention

Notes persist until removed for moderation. You can request removal of notes you authored by contacting us.

## Hosting

Notes are stored on Amazon Web Services (DynamoDB) and served via Amazon CloudFront. Data is processed in the
AWS `il-central-1` (Tel Aviv) region.

## Permissions

The extension requests only the permissions its features need; each is used solely as described above.

| Permission | Why it is needed |
|---|---|
| `contextMenus` | Adds a right-click menu on the extension's toolbar icon to switch which category the side panel shows — no page content is read. |
| `identity` | Google sign-in via `launchWebAuthFlow` to obtain a verified ID token — only when you choose to post a note. |
| `sidePanel` | The whole UI is a side panel that lists notes for the current page and lets you post one. |
| `storage` | Your per-site on/off list (`chrome.storage.sync`) and a short-lived sign-in token cache (`chrome.storage.session`). No browsing data. |
| `tabs` | Reads the active tab's URL to fetch that page's notes, and refreshes when you switch tabs. |
| `webNavigation` | Detects in-page (single-page-app) navigations so the list refreshes when the URL changes without a full reload. |
| `scripting` | Registers the optional link-hover content script dynamically, and only after you grant host access at runtime — nothing is injected without your opt-in. |
| Optional host permissions (`http://*/*`, `https://*/*`) | Requested at runtime with your explicit consent to enable the link-hover notes preview; nothing is granted at install time. |

## Contact

Questions or removal requests: **legal@missingbulb.com**.

## Changes

We may update this policy; the "Last updated" date above reflects the latest revision.
