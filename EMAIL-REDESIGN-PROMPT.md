# Claude Code Prompt — Premium Visual Redesign of the Confirmation / Reminder Emails

> Paste below the line into Claude Code from the repo root.

---

You are redesigning the customer-facing emails for a Next.js + Resend app so they look **high-end, modern, and professional** — on the level of Stripe, Linear, Airbnb, or Ramp transactional email. This is a **visual + email-deliverability** task only; do not change *when* or *to whom* emails are sent.

## Why this is needed (diagnosis of the current design)

The current emails are built in `app/api/cron/send-scheduled-emails/route.js` via `htmlShell(innerHtml)`, `buildButton(href)`, `buildMainEmail`, `buildRemainingEmail`, `buildConfirmedEmail`, and `SIGNATURE_TEXT`. Problems visible in a real Gmail (iOS, dark mode) render:

1. **Dark-mode mangling.** The template hardcodes a light `#f4f6f3` shell and a white card with no `color-scheme` support, so Gmail/Apple Mail auto-invert it into a muddy dark-gray "card inside a card." It looks broken, not intentional. **This is the #1 problem.**
2. **Flat, juvenile buttons.** Two solid rounded-green rectangles with no depth, no refinement, awkward proportions. They read as a hobby project, not a brand.
3. **Weak typography & hierarchy.** Default system stack, no real type scale, cramped/centered blocks, low-contrast gray helper text.
4. **No visual identity.** No real logomark, no considered spacing system, no premium finishing details (dividers, eyebrow labels, iconography, subtle shadows that survive email clients).

## Color direction (you may pick the most beautiful option — does NOT have to match the brand)

The owner has explicitly said the palette can be **anything that looks the most premium**. Choose ONE cohesive system and apply it consistently. Recommended directions, pick whichever you can execute most beautifully:

- **Option A — "Ink & Indigo" (recommended):** warm near-white paper `#F6F5F3`, surface `#FFFFFF`, ink text `#15181E`, muted `#6B7280`, hairline `#E8E6E1`, primary accent indigo `#4F46E5` → deep `#4338CA`, with a soft accent tint `#EEF0FF`. Feels fintech-premium and reads cleanly in both modes.
- **Option B — "Editorial Emerald":** paper `#F7F7F5`, ink `#111827`, refined emerald `#0E9F6E`/`#047857`, tint `#E7F6EF`. A more elevated take on the existing green if you want brand continuity.
- **Option C — "Graphite & Amber":** charcoal-forward, paper `#FAFAF9`, ink `#1C1917`, warm amber accent `#D97706`, tint `#FEF3E2`. Confident and warm.

Whichever you choose, define it once as a small token object at the top of the email module and reference it everywhere (no scattered magic hex values).

## Hard email constraints (must follow — this is what makes it actually render well)

1. **Table-based layout, fully inline CSS.** No fl\\exbox/grid, no external stylesheets, no `<style>`-only styling for structure. Use `role="presentation"` tables. Max content width **600px**, centered, fluid down to ~320px.
2. **Dark-mode aware (critical).** Add to `<head>`: `<meta name="color-scheme" content="light dark">` and `<meta name="supported-color-schemes" content="light dark">`. Include a `<style>` block with `@media (prefers-color-scheme: dark)` overrides AND Gmail-specific `[data-ogsc]` / `[data-ogsb]` fallbacks so the design is **intentionally beautiful in dark mode** instead of being auto-inverted into mud. Pick surface/text colors that hold up when a client force-inverts them; never rely on pure `#FFFFFF` with light-gray text.
3. **Bulletproof buttons.** Build CTAs as a `<table>` cell with `bgcolor` + padding + a fully-styled `<a>`, and include the **VML `<v:roundrect>`** fallback (wrapped in `<!--[if mso]> ... <![endif]-->`) so Outlook renders rounded, colored buttons. Min tap target 44px tall, generous horizontal padding, subtle but real styling (rounded ~10–12px, confident weight, slight letter-spacing). No flat kindergarten blocks.
4. **Images.** If you add a logomark or icons, host them at absolute HTTPS URLs (use the existing app/public or Cloudinary) with explicit `width`/`height` and meaningful `alt`; never rely on background images for critical content. Prefer a crisp lightweight PNG/SVG-as-PNG logo. The design must still look complete with images blocked (use a styled text/initials wordmark as the baseline).
5. **Accessibility & deliverability.** Real text (not text-in-images) for all copy; sufficient contrast in both modes; `lang` set; preheader text included (a hidden snippet that controls the inbox preview line); plain-text alternative kept in sync for every template.
6. **Keep the templating system intact.** Preserve all personalization placeholders the send pipeline replaces per-recipient in `lib/email.js`: `{{UNSUBSCRIBE_LINK}}`, `{{CONFIRM_LINK_DAY1}}`, `{{CONFIRM_LINK_DAY2}}`, `{{CONFIRM_LINK}}`. Keep `htmlShell`/`buildButton` as reusable building blocks (refactor their internals, don't break their call sites). Don't alter recipient logic, scheduling, or the cron flow.

## Design system to implement

- **Shell:** a calm paper background with a centered 600px surface card that has a soft, email-safe shadow (or a hairline border in dark mode where shadows vanish). Comfortable vertical rhythm (e.g., 32–40px section padding).
- **Header:** a refined wordmark/logomark for "Laundry Day NYC" (clean lockup, not just a green dash + caps). Small uppercase eyebrow label allowed, but make it elegant.
- **Hero:** clear H1 (~24–28px, tight leading, strong weight) + one supporting sub-line in muted ink. State the action plainly ("Confirm your pickup this week").
- **CTA group:** the two day options (`{{CONFIRM_LINK_DAY1}}` / `{{CONFIRM_LINK_DAY2}}`) presented as a polished primary + secondary pair (or two equal premium buttons) with a tiny "one tap, no typing needed" reassurance line. For single-day templates, one primary CTA.
- **Info card:** the "bag out by 10 AM" reminder as a tasteful tinted callout with an icon — not a flat colored box.
- **Footer / signature:** quiet, well-spaced contact block (phone, email, website, Terms) + the unsubscribe line, in muted ink with clear link affordances. Keep `TERMS_URL`.
- **Finishing details:** a hairline divider system, consistent corner radii, optional small check/clock/truck icon accents that match the palette.

## Apply across every template

Use the new system for all of these so the brand is consistent:
- `buildMainEmail` (weekly two-day reminder)
- `buildRemainingEmail` ("pickup is today" single-CTA)
- `buildConfirmedEmail` ("you're confirmed" success state — lean into a premium confirmation look)
- the one-tap confirm preview/test email (subject seen as "[TEST] One-tap confirm preview")
- the **`/confirm` result page** (`app/confirm/page.js`) and the **`/pickup` fallback page** (`app/pickup/page.js`) — restyle these web pages to match the new email design language so the click-through experience is seamless (drop the old purple gradient).
- the **live ETA alert email** (if/when present) should reuse the same shell.

## Implementation notes

- Consider extracting the email HTML system into `lib/email-templates.js` (shell, button, callout, footer, palette tokens, preheader helper) and importing it into the cron + any other senders, so there's a single source of truth. Keep `htmlShell`/`buildButton` exported for backward compatibility.
- Keep each template's **plain-text** version updated to mirror the new copy.
- Do not introduce heavy dependencies; hand-write the HTML/CSS (optionally use a tiny, well-tested approach — but no full MJML build step unless trivial and self-contained).

## Acceptance criteria

1. Rendered in **Gmail iOS dark mode** (the exact failing case in the screenshot), the email looks **intentionally designed and premium** — no muddy card-in-card, readable contrast, crisp buttons.
2. Renders correctly in: Gmail web (light + dark), Apple Mail (macOS + iOS, light + dark), and Outlook (buttons stay rounded/colored via VML).
3. Buttons are obviously tappable, ≥44px tall, and styled with real polish.
4. All four placeholders still personalize correctly through `lib/email.js` batch send; cron scheduling/recipients unchanged.
5. Plain-text fallback present and accurate for every template; preheader set.
6. `/confirm` and `/pickup` pages visually match the new email design.
7. `npm run build` passes.

**Deliver a before/after note** describing the palette you chose and the dark-mode strategy, and (if possible) paste the final HTML of `buildMainEmail` into the PR description so it can be previewed.
