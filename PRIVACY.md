# TLDR — Privacy Policy

_Last updated: 2026-06-26_

TLDR is a Chrome extension for reading and posting short community notes ("comments") attached to web
pages. This policy describes what it collects and why.

## What we collect
When you **post a comment**, we store:
- your Google account's stable user id (`sub`) and display name, taken from the Google ID token you
  authorize at sign-in;
- the text of your comment;
- the normalized URL of the page you commented on (query string and fragment removed), plus the raw URL
  for debugging.

When you **read** comments, no account information is sent — reads are anonymous and public.

## What we do NOT collect
- **We do not store your email address.** It is not saved and is never returned to anyone.
- We do not track your browsing. The extension only contacts our service for a page **while its side panel
  is open**, and never for pages on the built-in or user-configured denylist (e.g. `localhost`).
- No advertising, no analytics, no third-party trackers.

## How it's used and who can see it
- **Comments are public.** Anyone using TLDR can read the comments (and the commenter's display name) on a
  page. Do not post anything you wouldn't want publicly visible.
- Your Google user id is used only to attribute your comments and to rate-limit posting.

## Where it's stored
Comments are stored in Amazon DynamoDB in the AWS Tel Aviv (`il-central-1`) region, with continuous backups
enabled. Reads are served through Amazon CloudFront.

## Authentication
Posting uses Google Sign-In (OpenID Connect). We receive a signed identity token containing your user id,
name, and email-verification status; we keep the id and name as described above.

## Data removal
v1 does not yet support editing or deleting comments in-product. To request removal of your comments,
contact the maintainer.

## Contact
Open an issue at https://github.com/missingbulb/tldr or contact the repository owner.
