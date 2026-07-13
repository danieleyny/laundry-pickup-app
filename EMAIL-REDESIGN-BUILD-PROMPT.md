# Claude Code Prompt — Build the Approved Confirmation Email (exact spec)

> Paste below the line into Claude Code from the repo root. This recreates a specific, owner-approved design. Match it pixel-for-pixel within email-client constraints. Colors, sizes, and spacing below are exact — use them verbatim.

---

You are rebuilding the customer-facing reminder/confirmation emails in this Next.js + Resend app to match an **approved design**. The emails are built in `app/api/cron/send-scheduled-emails/route.js` via `htmlShell(innerHtml)`, `buildButton(href)`, `buildMainEmail(area)`, `buildRemainingEmail(area, todayDay)`, `buildConfirmedEmail()`, and `SIGNATURE_TEXT`. Keep these functions (refactor internals; don't break call sites) or extract a shared `lib/email-templates.js` and import it. **Do not change scheduling, recipients, or the cron flow** — this is visual only.

## Non-negotiable email constraints
- **Table-based layout, fully inline CSS.** No flexbox/grid for structure. `role="presentation"` tables. Content width **600px max**, centered, fluid down to 320px (looks identical on mobile and desktop — single column that just widens).
- **Dark mode is designed, not inverted.** Add to `<head>`: `<meta name="color-scheme" content="light dark">` and `<meta name="supported-color-schemes" content="light dark">`. Include a `<style>` block with `@media (prefers-color-scheme: dark)` overrides **and** Gmail `[data-ogsc]`/`[data-ogsb]` fallbacks that apply the dark palette below. Do not rely on auto-inversion.
- **Bulletproof buttons.** Each "day card" (below) is a full-width tappable button built as a `<table>` with the container cell carrying the fill color + padding, the entire card wrapped in a single `<a>`. Include a VML `<!--[if mso]><v:roundrect>…<![endif]-->` fallback so Outlook keeps rounded, colored buttons. Min height ≥ 52px.
- **Icons:** recreate the small icons (calendar, clock, lock, arrow) as **hosted PNGs at 2× (retina)** placed in `/public/email/` and referenced by absolute HTTPS URL (use `NEXT_PUBLIC_APP_URL`), each with `width`/`height` + `alt`. The arrow may instead be the Unicode `→` if cleaner. **The design must still read correctly with images disabled** (text + layout carry it).
- **Preserve placeholders** replaced per-recipient in `lib/email.js`: `{{UNSUBSCRIBE_LINK}}`, `{{CONFIRM_LINK_DAY1}}`, `{{CONFIRM_LINK_DAY2}}`, `{{CONFIRM_LINK}}`. Keep a synced **plain-text** version + a hidden **preheader** snippet for every template.

## Layout structure (top → bottom), inside the centered 600px shell

The shell has an outer page background and an inner white **card** (rounded), with a **footer below the card** (not inside it).

1. **Eyebrow** (this is now the very top element — there is NO logo/icon mark above it): centered text `WEEKLY PICKUP`, 11px, weight 500, letter-spacing 1.6px, accent color. Margin-bottom 18px.
2. **H1**: centered `Confirm your pickup`, 25px, weight 700, ink color, line-height 1.2, margin 0 0 9px.
3. **Subhead**: centered `Choose the day that works for you this week. One tap — nothing to type.`, 15px, muted color, line-height 1.55, margin 0 0 22px.
4. **Two day cards** (stacked, 11px gap, margin-bottom 18px). Each card: radius 13px, padding 15px 17px, full width; left = calendar icon (22px); middle = two lines (day name 17px/weight 500, and `Tap to confirm` 12px); right = arrow (20px). The day names come from `AREA_CONFIG` (`day1` = primary card, `day2` = secondary card). The whole card links to `{{CONFIRM_LINK_DAY1}}` / `{{CONFIRM_LINK_DAY2}}` respectively.
   - **Primary (day1):** solid accent fill, white text, lighter-tint icon + sublabel.
   - **Secondary (day2):** card-surface fill with a 1.5px accent border, accent-colored day name + icon + arrow, muted sublabel.
5. **Reassurance row**: centered, lock icon (14px) + `Each link is secured to your email address.` 12px, subtle/muted color. Margin-bottom 20px.
6. **Reminder callout**: tinted box, radius 12px, padding 13px 15px; clock icon (19px) on the left + text `Please have your bag outside by 10 AM on your pickup day so our driver doesn't miss you.` 13px, line-height 1.5 (the "10 AM" is weight 500).
7. **Footer** (below the card): centered, padding 20px 10px 8px.
   - `The Laundry Day Team` — 13px, weight 500, accent color, margin-bottom 6px.
   - `(646) 705-0600 · laundrydaynyc@gmail.com` then new line `laundryday.nyc · Terms of Service` — 12px, muted, line-height 1.7. Keep using the existing `TERMS_URL`; make email + website + Terms real links.
   - `Don't need a pickup this week? No action needed. · Unsubscribe` — 11px, faint color, margin-top 9px; "Unsubscribe" → `{{UNSUBSCRIBE_LINK}}`.

## Exact palette — LIGHT MODE
| Token | Hex |
|---|---|
| Page background | `#EEF0F4` |
| Card background | `#FFFFFF` |
| Card border | `0.5px solid #E7E8EE` (radius 18px, padding 26px 22px) |
| Eyebrow / accent | `#4F46E5` |
| H1 ink | `#15181E` |
| Subhead / muted | `#6B7280` |
| Primary card fill | `#4F46E5` · text `#FFFFFF` · icon+sublabel `#C7C9FF` |
| Secondary card | fill `#FFFFFF` · border `1.5px #4F46E5` · day name `#3730A3` · icon+arrow `#4F46E5` · sublabel `#6B7280` |
| Reassurance text/icon | `#9AA1AC` |
| Callout box bg | `#EEF0FF` · icon `#4F46E5` · text `#312E81` |
| Footer team | `#4F46E5` · contact `#8A8F99` · fine print `#AEB2BA` |

## Exact palette — DARK MODE
| Token | Hex |
|---|---|
| Page background | `#0E1116` |
| Card background | `#161A22` |
| Card border | `0.5px solid #262B34` |
| Eyebrow / accent | `#9AA0FF` |
| H1 ink | `#F2F3F5` |
| Subhead / muted | `#9AA1AC` |
| Primary card fill | `#5B62F0` · text `#FFFFFF` · icon+sublabel `#CDCFFF` |
| Secondary card | fill `#1B2030` · border `1.5px #5B62F0` · day name `#C9CCFF` · icon+arrow `#9AA0FF` · sublabel `#9AA1AC` |
| Reassurance text/icon | `#737A86` |
| Callout box bg | `#1B2030` · icon `#9AA0FF` · text `#CDD0F0` (the "10 AM" → `#FFFFFF`) |
| Footer team | `#9AA0FF` · contact `#7C828D` · fine print `#5F6671` |

Use `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Two weights only (400 / 700; 500 where noted). Flat fills only — no gradients.

## Apply across all templates
- **`buildMainEmail`** — the two-day layout above (day1 primary / day2 secondary).
- **`buildRemainingEmail`** — single primary day card (the one active day) → `{{CONFIRM_LINK}}`; headline `Pickup is today`, subhead noting today's day; same shell/footer/callout.
- **`buildConfirmedEmail`** — success variant: swap the eyebrow for a small check treatment, headline `You're confirmed`, drop the day cards, keep the 10 AM callout + footer; same palette.
- The **one-tap confirm preview/test email** must use this exact build.
- Restyle the **`/confirm`** (`app/confirm/page.js`) and **`/pickup`** (`app/pickup/page.js`) web pages to match this design language (same palette, card, day-card buttons) so the click-through is seamless — remove the old purple gradient.
- If the live ETA alert email exists, reuse the same shell.

## Acceptance criteria
1. Side-by-side with the approved mockup, the **main email matches**: eyebrow (no logo mark), headline, subhead, two day cards (primary filled / secondary outlined, with icon + "Tap to confirm" + arrow), reassurance line, tinted 10 AM callout, footer — same spacing, radii, and colors above.
2. **Gmail iOS dark mode** (the previously-broken case) renders the dark palette intentionally — no muddy card-in-card, crisp buttons, readable contrast.
3. Renders correctly in Gmail (web light+dark), Apple Mail (macOS+iOS, light+dark), Outlook (buttons stay rounded/colored via VML).
4. Day cards are full-width, ≥52px tall, obviously tappable; links carry the correct `{{CONFIRM_LINK_*}}` placeholders and still personalize through `lib/email.js`.
5. Looks identical in structure on mobile and desktop (single column, just wider on desktop).
6. Plain-text + preheader present for every template; cron scheduling/recipients unchanged; `npm run build` passes.

Deliver a short note stating the palette used and the dark-mode technique, and paste the final `buildMainEmail` HTML into the PR description for preview.
