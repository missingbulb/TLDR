# TLDR extension — UI requirements

The **specific, testable UI requirements** for the extension's two user-facing surfaces — the
**side panel** (`client/src/sidepanel.{html,css,mjs}`) and the **options page**
(`client/src/options.{html,mjs}`): what they must render, how they must behave, and the exact copy,
structure, and accessibility semantics they must carry.

This is the **executable** half of the spec: every leaf below carries a stable number and is claimed
by exactly one **case** that proves it, of exactly one **kind** of verification. The build is red the
moment a leaf is added without a case (`requirements-coverage.test.mjs`). See [README.md](README.md)
for the methodology, the kinds, and the owner-approval contract.

> # ⚠️ A GREEN BUILD MEANS "CLAIMED", NOT "FULLY VERIFIED" ⚠️
>
> Every leaf is *claimed* by one case of the right kind, so the coverage gate proves each leaf is
> verified by the kind of test it needs. What it does **not** prove is end-to-end fidelity: the `dom`
> and `behavior` cases drive the **real** `sidepanel.mjs` / `options.mjs` under **jsdom + a fake
> `chrome.*`** — faithful to our *model* of Chrome, but not proof that a *real* Chrome loads the
> extension and paints the panel. That last layer is tracked as the `tbd` leaf `8.1`.

**Numbering.** Every leaf carries a stable dotted number (e.g. `1.3`). Its one case is named
`<slug>.<id>.case.mjs` where `<slug>` is the section's component/feature name, so a case and the
requirement it pins cross-check by number. Add new requirements with new numbers; don't renumber or
reuse existing ones.

**How each leaf is verified is declared by its CASE (its folder), not tagged here.** The left cell of
each row is **generated** from the case (the rendered image for a `dom` leaf, a note for a coded
leaf); don't hand-edit a line carrying a `<!-- req-gallery:… -->` marker — run `npm run refresh:ui`.

---

## 1. Side panel — states

The panel is a small state machine over the active tab. Each state below is pinned by a `dom` image:
the panel's real `render()` run against faked inputs, rasterized with the real `sidepanel.css` for
visual approval.

<table>
<tr>
<td valign="top" width="340">

![disabled-state.1.1](dom/cases/disabled-state.1.1.png) <!-- req-gallery:1.1 -->

</td>
<td valign="top">

`1.1` On a **non-commentable** page (a denylisted host, or a non-http(s)/unparseable URL), the panel
shows the status **"TLDR is off for this page."**, an **empty** page line, and **no** composer.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![empty-state.1.2](dom/cases/empty-state.1.2.png) <!-- req-gallery:1.2 -->

</td>
<td valign="top">

`1.2` On a **commentable** page with **no notes**, the header shows the constant title **"TLDR"** and
the page line shows the page's normalized id (mirrored in its `title` tooltip), the status reads
**"No notes yet — be the first."**, and the **composer is shown**.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![notes-list.1.3](dom/cases/notes-list.1.3.png) <!-- req-gallery:1.3 -->

</td>
<td valign="top">

`1.3` Each note renders as a **list item** carrying its body and a meta line
**"&lt;author&gt; · &lt;time&gt;"**, ordered **oldest first / newest last**.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![read-failure.1.4](dom/cases/read-failure.1.4.png) <!-- req-gallery:1.4 -->

</td>
<td valign="top">

`1.4` When the notes read **fails** and there's nothing to show, the status reads
**"Couldn't load notes."** (rather than the panel looking merely empty).

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![author-fallback.1.5](dom/cases/author-fallback.1.5.png) <!-- req-gallery:1.5 -->

</td>
<td valign="top">

`1.5` A note with **no author name** is attributed to **"Someone"** — never a blank byline.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![literal-body.1.6](dom/cases/literal-body.1.6.png) <!-- req-gallery:1.6 -->

</td>
<td valign="top">

`1.6` A note body that **looks like HTML** renders as **literal visible text** — the markup shows as
characters, not parsed into elements. (The security counterpart — that no element is actually
injected — is `3.3`.)

</td>
</tr>
</table>

## 2. Posting a note

What happens when you add a note, and who's allowed to. The **flow is shown as the panel actually
looks** at each step — *posting* (`2.1`), *saved* (`2.2`), *failed* (`2.3`) — driven by the real
gesture with the save mocked to land each outcome; the note's treatment **and Post's
enabled/disabled state** are the visible proof. The `behavior` leaves cover what an image can't (an
empty note posts nothing; reading is anonymous), and the `server` leaves prove the server itself
decides who may post.

<table>
<tr>
<td valign="top" width="340">

![posting.2.1](dom/cases/posting.2.1.png) <!-- req-gallery:2.1 -->

</td>
<td valign="top">

`2.1` When you press **Post**, your note appears **immediately** as **"posting…"** and **Post** is
**disabled** until it's saved — so you see it took and can't double-post.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![saved.2.2](dom/cases/saved.2.2.png) <!-- req-gallery:2.2 -->

</td>
<td valign="top">

`2.2` Once the save **succeeds**, your note becomes a **normal saved note** and **Post** is
**enabled** again.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![post-failed.2.3](dom/cases/post-failed.2.3.png) <!-- req-gallery:2.3 -->

</td>
<td valign="top">

`2.3` If the save **fails**, your note **isn't lost** — it stays, marked **failed**, the box shows
**"Could not post — try again."**, and **Post** is **enabled** again so you can retry.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🚩 _Behavior leaf — verified by `behavior/behavior.test.mjs` (a gesture a static snapshot can't show)._ <!-- req-gallery:2.4 -->

</td>
<td valign="top">

`2.4` An **empty or whitespace-only** note doesn't post and adds nothing.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🚩 _Behavior leaf — verified by `behavior/behavior.test.mjs` (a gesture a static snapshot can't show)._ <!-- req-gallery:2.5 -->

</td>
<td valign="top">

`2.5` You can **read** notes without signing in; **posting** attaches your signed-in identity.
_(Cross-tier: this is the UI half; the server enforcement is `2.6`.)_

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🛡️ _Server leaf — verified by `server/server.test.mjs` (the real handler's response, asserted server-side)._ <!-- req-gallery:2.6 -->

</td>
<td valign="top">

`2.6` **Only signed-in people can post** — the guarantee is the **server's**: a write with no
signed-in identity is rejected. _(Cross-tier: the UI half is `2.5`; this is the server enforcement.)_

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🛡️ _Server leaf — verified by `server/server.test.mjs` (the real handler's response, asserted server-side)._ <!-- req-gallery:2.7 -->

</td>
<td valign="top">

`2.7` **A verified email is required to post** — the server rejects a signed-in user whose Google
email isn't verified.

</td>
</tr>
</table>


## 3. Safety, limits & accessibility

What keeps the panel safe, bounded, and usable by everyone — stated as product behavior. *How* each
is checked (a screen-reader live region, the shipped markup, the server's response) is the
verification detail, not the requirement.

<table>
<tr>
<td valign="top" width="340">

🔧 _Logic leaf — verified by `logic/logic.test.mjs`._ <!-- req-gallery:3.1 -->

</td>
<td valign="top">

`3.1` When a new note arrives while the panel is open, a **screen-reader user is told about it**
without having to go looking. _(How: the notes list is an `aria-live="polite"` region.)_

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🔧 _Logic leaf — verified by `logic/logic.test.mjs`._ <!-- req-gallery:3.2 -->

</td>
<td valign="top">

`3.2` When a post fails, a **screen-reader user is told about the error** the moment it appears.
_(How: the error is a `role="alert"` live region.)_

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🚩 _Behavior leaf — verified by `behavior/behavior.test.mjs` (a gesture a static snapshot can't show)._ <!-- req-gallery:3.3 -->

</td>
<td valign="top">

`3.3` **Reading a note can never run code.** A note that contains HTML or a `<script>` shows as
**plain text** — it's never run or rendered as markup. _(How: the body is inserted as text, so a
crafted body injects no element. The server stores the note verbatim — it's content-agnostic — so
this safety lives where the note is shown.)_

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🔧 _Logic leaf — verified by `logic/logic.test.mjs`._ <!-- req-gallery:3.4 -->

</td>
<td valign="top">

`3.4` The note box **shows a prompt** for what to write and **caps very long notes**; you can post
with the button or the keyboard. _(How: the textarea's placeholder + `maxlength` 8192, and Post is a
submit-type button.)_

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🛡️ _Server leaf — verified by `server/server.test.mjs` (the real handler's response, asserted server-side)._ <!-- req-gallery:3.5 -->

</td>
<td valign="top">

`3.5` **A note over the size limit (~8 KB) is rejected** — and the guarantee is the **server's**, so
a client that bypasses the box's cap still can't store an oversized note. _(Cross-tier: the UI cap is
`3.4`; this is the server enforcement.)_

</td>
</tr>
</table>


## 4. Note time formatting

How a note's age reads on its meta line — visible UI, so each leaf is a `dom` image: a note rendered
at a fixed offset from the pinned reference instant (`shared/reference-time.mjs`), its meta line the
approved artifact.

<table>
<tr>
<td valign="top" width="340">

![time-just-now.4.1](dom/cases/time-just-now.4.1.png) <!-- req-gallery:4.1 -->

</td>
<td valign="top">

`4.1` A note **under a minute** old reads **"just now"**.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![time-minutes.4.2](dom/cases/time-minutes.4.2.png) <!-- req-gallery:4.2 -->

</td>
<td valign="top">

`4.2` A note **minutes** old reads **"Nm ago"**.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![time-hours.4.3](dom/cases/time-hours.4.3.png) <!-- req-gallery:4.3 -->

</td>
<td valign="top">

`4.3` A note **hours** old reads **"Nh ago"**.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![time-absolute-date.4.4](dom/cases/time-absolute-date.4.4.png) <!-- req-gallery:4.4 -->

</td>
<td valign="top">

`4.4` A note **a day or more** old reads the **absolute locale date** (it stops being "hours ago").

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![time-missing.4.5](dom/cases/time-missing.4.5.png) <!-- req-gallery:4.5 -->

</td>
<td valign="top">

`4.5` A note with **no timestamp** shows an **empty time** — never a bogus date or "NaN".

</td>
</tr>
</table>


## 5. Note render model (covered by unit tests — no leaves here)

The non-visual model the panel renders from is already covered by the existing `client/test/` unit
suites, so — like the reference project's events-model section — there are **no separate leaves
here**, to avoid a parallel, drift-prone duplicate:

- **The optimistic merge** (dedupe by id with the server winning, chronological order, the
  pending→confirmed→failed transitions) — `client/test/optimistic.test.mjs`.
- **The page commentability gate** (the two-layer denylist; host-suffix matching) —
  `client/test/denylist.test.mjs`.
- **The read/write API split** (public read, bearer write, the 401-refresh-retry) —
  `client/test/api.test.mjs`.
- **The Google ID-token helpers** (URL building, nonce/state, expiry) — `client/test/auth.test.mjs`.

The rendered §1–§4 requirements are the executable UI contract over that model.


## 6. Options page

The denylist editor (`client/src/options.{html,mjs}`).

<table>
<tr>
<td valign="top" width="340">

![options-page.6.1](dom/cases/options-page.6.1.png) <!-- req-gallery:6.1 -->

</td>
<td valign="top">

`6.1` The options page renders the denylist editor: the **heading**, the **helper text**, a
**textarea seeded** with the stored denylist (one host per line), and a **Save** button.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🚩 _Behavior leaf — verified by `behavior/behavior.test.mjs` (a gesture a static snapshot can't show)._ <!-- req-gallery:6.2 -->

</td>
<td valign="top">

`6.2` Saving **normalizes** the list (trim, lowercase, drop blank lines) and **dedupes** it, then
**persists** it to `chrome.storage.sync` and confirms with **"Saved."**; the normalized list is
reflected back into the textarea.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🚩 _Behavior leaf — verified by `behavior/behavior.test.mjs` (a gesture a static snapshot can't show)._ <!-- req-gallery:6.3 -->

</td>
<td valign="top">

`6.3` The **"Saved."** confirmation is **transient** — it clears a short time after the save.

</td>
</tr>
</table>


## 7. Manifest UI surfaces

The user-facing entry points declared in the manifest (distinct from the packaging/least-privilege
guards in `client/test/manifest.test.mjs`).

<table>
<tr>
<td valign="top" width="340">

🔧 _Logic leaf — verified by `logic/logic.test.mjs`._ <!-- req-gallery:7.1 -->

</td>
<td valign="top">

`7.1` The toolbar **action** is titled **"Open TLDR notes"** — the hover affordance for what clicking
the icon does.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🔧 _Logic leaf — verified by `logic/logic.test.mjs`._ <!-- req-gallery:7.2 -->

</td>
<td valign="top">

`7.2` The **options page** (denylist editor) is registered as the extension's **options UI**
(`options_ui` → `src/options.html`).

</td>
</tr>
</table>


## 8. Real-browser end-to-end

<table>
<tr>
<td valign="top" width="340">

⚠️ _Behavior leaf — **untested here** — covered today by `node --check of the chrome.* glue in .github/workflows/client.yml (a real-Chrome e2e is a tracked follow-up)`._ <!-- req-gallery:8.1 -->

</td>
<td valign="top">

`8.1` **(tbd)** The unpacked extension loads in a **real Chrome**: the toolbar click opens the side
panel and the service-worker glue runs. Today only partially covered (the `node --check` syntax pass
in CI catches a typo in the `chrome.*` glue); a real-Chrome e2e is a tracked follow-up.

</td>
</tr>
</table>


## 9. Upvoting

Endorsing a note. Each saved comment carries an upvote control + count in the list; a signed-in user
can cast one vote per comment and toggle it off. The **count rides the shared, CDN-cached public read**
(so it's stale up to the ~60s TTL and identical for every viewer — an accepted trade-off, issue #22);
the **viewer's own vote can't** ride that read (the cache key excludes `Authorization`), so it's shown
optimistically and persisted client-side (`chrome.storage.local`). The voted/un-voted look is a `dom`
image; the optimistic toggle + rollback are `behavior` gestures; the merge rule is a `logic` leaf; and
the server enforcement (attributed, idempotent, no identity leak) sits alongside as `server` leaves.

> The affordance distinguishes voted from un-voted by **accent colour + border** (a filled ▲ either
> way — the bundled snapshot font has no outline triangle, and colour is not the only signal:
> `aria-pressed` and the button title carry the state to assistive tech).

<table>
<tr>
<td valign="top" width="340">

![upvote-control.9.1](dom/cases/upvote-control.9.1.png) <!-- req-gallery:9.1 -->

</td>
<td valign="top">

`9.1` A saved comment row renders an **upvote control with its count**, in the **un-voted** state (a
muted outline pill: ▲ and a plain count, e.g. `3`).

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![upvote-voted.9.2](dom/cases/upvote-voted.9.2.png) <!-- req-gallery:9.2 -->

</td>
<td valign="top">

`9.2` The same row in the **voted-by-me** state — an **accent-coloured** pill (accent border), the
count including your vote.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

![upvote-zero.9.3](dom/cases/upvote-zero.9.3.png) <!-- req-gallery:9.3 -->

</td>
<td valign="top">

`9.3` A comment with **zero** votes still renders the affordance showing **`0`** — the control is
never missing.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🚩 _Behavior leaf — verified by `behavior/behavior.test.mjs` (a gesture a static snapshot can't show)._ <!-- req-gallery:9.4 -->

</td>
<td valign="top">

`9.4` Clicking the control **optimistically increments** the count and **flips to voted**; clicking
again **toggles back** (count restored). _(Cross-tier: the server enforcement is `9.7`/`9.8`.)_

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🚩 _Behavior leaf — verified by `behavior/behavior.test.mjs` (a gesture a static snapshot can't show)._ <!-- req-gallery:9.5 -->

</td>
<td valign="top">

`9.5` A **failed** vote write **rolls the count and affordance back** — a rejected vote leaves no
phantom count.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🔧 _Logic leaf — verified by `logic/logic.test.mjs`._ <!-- req-gallery:9.6 -->

</td>
<td valign="top">

`9.6` On a refresh, the merge keeps the **server's `voteCount` authoritative** while **preserving the
viewer's own `youVoted`** — the server can't know your vote (the public read is shared and cache-keyed
without `Authorization`), so the client carries it. _(How: `mergeComments` in `client/src/optimistic.mjs`.)_

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🛡️ _Server leaf — verified by `server/server.test.mjs` (the real handler's response, asserted server-side)._ <!-- req-gallery:9.7 -->

</td>
<td valign="top">

`9.7` A first `POST …/vote` **records one vote and sets the count to 1**; a **repeat by the same user
is idempotent** (still 1). _(Cross-tier: the UI half is `9.4`.)_

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🛡️ _Server leaf — verified by `server/server.test.mjs` (the real handler's response, asserted server-side)._ <!-- req-gallery:9.8 -->

</td>
<td valign="top">

`9.8` `DELETE …/vote` **removes the vote and decrements**; deleting a vote that was **never cast is a
no-op success**.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🛡️ _Server leaf — verified by `server/server.test.mjs` (the real handler's response, asserted server-side)._ <!-- req-gallery:9.9 -->

</td>
<td valign="top">

`9.9` A vote with **no signed-in identity is rejected** — voting is **attributed** (the guarantee is
the server's, like posting), while reads stay public.

</td>
</tr>
</table>

<table>
<tr>
<td valign="top" width="340">

🛡️ _Server leaf — verified by `server/server.test.mjs` (the real handler's response, asserted server-side)._ <!-- req-gallery:9.10 -->

</td>
<td valign="top">

`9.10` The public read projection **returns `voteCount`** and **never leaks per-voter identity** — the
count is shared, but who voted is not.

</td>
</tr>
</table>
