# Claude Code Implementation Prompt — Laundry Day NYC v2

> Paste everything below the line into Claude Code from the repo root. It is written to be executed phase-by-phase. Do not start a phase until the previous one builds and passes its acceptance checks.

---

You are upgrading an existing **Next.js 14 (App Router)** app that runs a weekly laundry pickup operation in Manhattan. Stack: Next.js 14, React 18, **Google Sheets as the database** (`googleapis`), **Resend** for email (`lib/email.js`), **Cloudinary** for photos (`lib/cloudinary.js`), deployed on **Vercel** with **Vercel Cron**. Keep all of these — do **not** introduce a new database, SMS, payments, or a framework migration beyond what's specified.

## Repo orientation (read these before coding)

- `lib/sheets.js` — all Google Sheets I/O + the route-sorting heuristics (`getSide`, `getCrossStreet`, `sortByRoute`, `buildPickupList`, `buildCombinedList`, route edits/order, driver progress, issues, dropoff photos, opt-outs, settings, stale customers). Server-only (imports `googleapis`).
- `lib/email.js` — Resend wrapper: `sendEmail`, `sendBccEmail` (per-recipient personalization + `{{UNSUBSCRIBE_LINK}}` replacement + batching/retry).
- `lib/cloudinary.js` — photo upload + `deleteOldPhotos` retention.
- `app/api/cron/send-scheduled-emails/route.js` — the automated reminder engine (7:20 AM ET; Tue/Thu downtown, Fri/Sat uptown; Mon stale report). **This is the source of truth for sending.**
- `app/api/confirm/route.js` + `app/pickup/page.js` + `app/confirm/page.js` — customer confirmation flow.
- `app/api/driver/route/route.js` + `app/driver/page.js` — driver route + driver PWA (login, sequential "current stop" card, "All stops" list with drag-reorder, ETAs, issue/dropoff photo capture).
- `app/api/admin/driver-tracking/route.js` + `app/dashboard/page.js` — admin dashboard (one long scrolling page) + live tracking.
- Sheet tabs already used: `<Area> Customers`, `Keys`, `Pickup Responses`, `Route Edits`, `Route Order`, `Driver Progress`, `Driver Issues`, `Dropoff Photos`, `Email Bounces`, `Opt-outs`, `Settings`.

## Global guiding principles (apply to every phase)

1. **Never break the automated cron.** It must keep sending on schedule exactly as today. Everything else is additive or a UI change.
2. **Additive, not destructive, for the driver.** The stop-by-stop "current stop" flow stays the default; new views are extra toggles.
3. **Preserve manual override everywhere.** Any auto-ordering must yield to a saved manual drag order (the existing `Route Order` behavior).
4. **Feature-flag risky/cost-bearing features** via the `Settings` tab (`getSetting`/`setSetting`) so they can be toggled without a redeploy. Default new external-cost features **OFF**.
5. **Keep Google Sheets as the store.** New persistent data → new tabs, auto-created with the same `ensure*Tab` pattern already in `lib/sheets.js`.
6. **Don't duplicate logic.** Where the same algorithm exists on client and server, extract it to a shared module (see Phase 3).
7. After each phase: `npm run build` must pass, and you must self-verify against that phase's **Acceptance** list.

---

# PHASE 0 — Design system & brand unification

**Problem being fixed (pain points):** admin uses purple/teal/orange inline-style gradients that clash with the driver app's clean green; styling is thousands of inline objects, so restyling is painful.

1. Add **Tailwind CSS** to the Next 14 app (`tailwind.config.js`, `postcss.config.js`, `app/globals.css` with `@tailwind` directives, import in `app/layout.js`).
2. Create `lib/theme.js` exporting design tokens derived from the **driver app's existing `PALETTE`** (`app/driver/page.js`): brand `#7CB342`, brandDeep `#558B2F`, brandDark `#33691E`, pickup `#2E7D32`, dropoff `#C62828`, ink `#0F1A0A`, muted `#6B7569`, surface, border, etc. Mirror these as Tailwind theme colors (e.g., `brand`, `brand-deep`, `pickup`, `dropoff`, `ink`, `muted`).
3. Build a small shared component kit in `app/components/ui/` using Tailwind: `Button`, `Card`, `Badge`, `Toggle`, `Tabs`, `Table`, `Modal/Lightbox`, `StatTile`, `ProgressBar`, `EmptyState`. These are used by the new admin and reused where practical.
4. **Migration scope:** fully migrate the **admin dashboard** (Phase 1) to Tailwind + the kit. The driver app may keep its current visuals but must import its colors from `lib/theme.js` so the two stay in sync. The customer `/pickup` and `/confirm` pages should be restyled to the green brand (drop the purple gradient).

**Acceptance:** build passes; a sample page renders the green tokens; no hardcoded purple (`#667eea`/`#764ba2`) remains in admin or customer pages.

---

# PHASE 1 — Admin dashboard redesign (the headline change)

**Problem being fixed:** one long jumbled scroll, no navigation, daily actions mixed with analytics/settings, not mobile-friendly. Implements admin-redesign items 6.1–6.8 + retention dashboard (7.4).

Rebuild `app/dashboard/page.js` (extract sections into `app/dashboard/` subcomponents) as a **tabbed/sidebar app shell** with these sections:

1. **Today (home, day-aware).** Reads current ET weekday and shows only what matters now:
   - The active area's confirmation count + progress for today's pickup day, with the **live tracking map/list as the hero** when it's a pickup day (auto-refresh on, no manual "Load" click).
   - A single reminder **status panel**: "Automation: ON · Next send: Friday 7:20 AM ET" + last cron run result (from `Settings`: `last_cron_run_*`).
   - The emergency **"Send reminders now"** button (Phase 2).
   - Quick links to the day's pickup list / route.
2. **Route.** The pickup-list builder + route table (current "View Pickup List" + reorder/add-stop), plus the **"Optimize route"** button (Phase 3). Day1/Day2 selector. Excel export retained.
3. **Customers (new).** A real management UI over `<Area> Customers`:
   - Search, list, add, edit, and soft opt-out (write to `Opt-outs`). Persist edits back to the customer tab (extend `lib/sheets.js` with `addCustomer`, `updateCustomer`, `setCustomerOptOut`).
   - Per-customer drawer: pickup history (from `Pickup Responses`), last-seen, and **drop-off proof photos** via `getDropoffPhotos(area, address, unit)` (Phase 5).
4. **Analytics.** Driver Statistics (existing `/api/driver-stats`) + Email Bounces (existing) + a **Retention panel** (7.4): confirmations/week trend, active vs. stale customers (reuse `getStaleCustomers`), simple churn/win-back list. Charts may use a light lib (e.g., `recharts`) or hand-rolled SVG bars.
5. **Settings.** All existing toggles (email scheduling, driver test mode, driver tenant emails) + last-run indicator + any new flags (Phase 6). Add **dark mode** toggle (persist in `localStorage`; Tailwind `dark:` classes).

Requirements: fully responsive (usable on a phone), preserve the 24h PIN session restore, keep the area (uptown/downtown) switcher in the shell. Live-tracking must also surface **drop-off photos** (Phase 5), not just issue photos.

**Acceptance:** every capability that exists today is reachable from the new nav; nothing requires scrolling past unrelated sections; works at 375px width; dark mode toggles; build passes.

---

# PHASE 2 — Reminder flow: automation primary + emergency one-button send + one-tap confirm

**Problem being fixed:** two overlapping reminder systems (automated cron vs. the manual copy-BCC-into-Gmail cards) make it confusing which is the source of truth.

### 2a. Single source of truth + emergency manual send
- The **cron stays primary and automatic** — no change to its schedule or logic.
- **Remove the copy-paste BCC/subject/body cards** (`loadEmailLinks`, `getEmailBody`, `Day2 Confirmations` copy cards, `generate-email-links`) from the primary UI. Replace with a **"Send reminders now (manual backup)"** action on the Today tab that actually **sends via Resend through the same code path the cron uses**, not copy-paste.
  - Implement by calling the existing cron handler logic. Either: POST to a new thin endpoint `app/api/admin/send-now/route.js` that authenticates the admin PIN and invokes the same task-building + `sendBccEmail` flow for a chosen `{area, day}`; or reuse `GET /api/cron/send-scheduled-emails?pin=<ADMIN_PIN>&day=<Day>` (it already supports admin-forced manual sends). Prefer extracting the shared "build + send tasks for a day" into a function reused by both.
  - Require a confirmation modal ("Send to N recipients now?") and show the result ("Sent to N in M batches").
- Keep a clearly-labeled **"Advanced / copy emails"** fallback tucked away (collapsed) only if trivial to retain; otherwise drop it. The mental model must be: **one system (Resend), two triggers (auto + manual).**

### 2b. One-tap confirmation (no typing)
**Today's gap:** the email button links to `/pickup?area=...`, where the customer must **type their email** before `/api/confirm` logs them. We will make confirmation a single tap by carrying a **signed identity token** in the link.

- Add `lib/confirm-token.js`: `makeToken({email, day, area, week})` = `HMAC-SHA256` over `email|day|area|week` using `process.env.CONFIRM_SECRET`, URL-safe base64; and `verifyToken(params, token)` returning boolean. (Node `crypto`, no new deps.)
- In `lib/email.js` `sendBccEmail`, we already know each recipient at send time and already personalize `{{UNSUBSCRIBE_LINK}}`. Add the same per-recipient replacement for **`{{CONFIRM_LINK_DAY1}}`** and **`{{CONFIRM_LINK_DAY2}}`** (and a single `{{CONFIRM_LINK}}` for the "remaining/today" template). Each resolves to:
  `${BASE_URL}/api/confirm?e=<email>&day=<Day>&area=<area>&w=<week>&t=<token>`
  Pass the needed `{area, week, day1, day2}` context into `sendBccEmail` (extend its signature) so it can build the links.
- Update the email builders in the cron (`buildMainEmail`, `buildRemainingEmail`) so the CTA buttons point at these placeholders instead of `/pickup?area=...`. For the **main** email render two buttons ("Confirm {day1}" / "Confirm {day2}"); for **remaining/today** render the single confirm button.
- Update `app/api/confirm/route.js`: accept `e` + `t` (+ `w`). If a **valid token** is present, **trust the identity and confirm immediately** (skip the type-email page), then redirect to the existing `/confirm` status page. If token is missing/invalid, **fall back to the current behavior** (redirect to `/pickup` to type email) — this preserves forwarded-email safety and backward compatibility.
- Keep `app/pickup/page.js` as the manual fallback (and restyle to the green brand).

**How identity works (for the spec reader):** the customer's email is embedded in their personalized link and signed with `CONFIRM_SECRET`. Because Resend sends one personalized message per recipient, each person's buttons already carry *their* email + the correct week. The HMAC token means the link can't be edited to confirm someone else's address, and scoping the token to the week prevents reusing an old link for a future week.

**Acceptance:** clicking a button in a sent email confirms with zero typing and lands on the success page; a tampered `e`/`day` (wrong token) safely falls back to the manual page; cron still sends on schedule; manual "Send now" sends real emails via Resend and reports counts.

---

# PHASE 3 — Route engine: de-dupe, real optimization, re-optimize, driver map

### 3a. De-duplicate the sort logic (pain point)
- The geographic heuristic (`getSide`, `getCrossStreet`, `sortByRoute`, the Manhattan address algorithm, the 953-Columbus/permanent-stop special cases) is duplicated in `lib/sheets.js` **and** inline in `app/dashboard/page.js` (`getClientSide`, `getClientCross`). Extract a **single pure module** `lib/route-geo.js` (no `googleapis` import) and import it from both `lib/sheets.js` and all client components. Delete the duplicates. This stays the **fallback** ordering when the optimization API is off or unavailable.

### 3b. Real geocoding + travel-time optimization (item 5.1)
- Add `lib/routing.js`. Default provider: **Mapbox** (token `MAPBOX_TOKEN`; generous free tier — see cost note in the chat/handoff). Keep provider behind a thin interface so Google can be swapped in.
- **Geocode + cache:** geocode each address once; cache `lat,lng` in a new auto-created **`Geocache`** sheet tab (`Address | Lat | Lng | UpdatedAt | Status`) via an `ensureGeocacheTab` + get/set helpers in `lib/sheets.js`. Reuse cache on subsequent runs; only geocode new/unknown addresses.
- **Manhattan-only constraint (required).** The business operates exclusively in Manhattan — every customer address is a Manhattan address. Enforce this so a bare "123 Broadway" can't resolve to Brooklyn, Queens, or another city:
  - Always send the geocoder a borough-qualified query, e.g. append **`, Manhattan, New York, NY`** to the address before lookup.
  - Constrain the request to Manhattan: pass a **bounding box** roughly `[-74.02, 40.70]` SW to `[-73.91, 40.88]` NE (Mapbox `bbox`) and/or `proximity` to a Manhattan centroid, and restrict result types to addresses/POIs.
  - **Validate the returned coordinate** against a Manhattan bounding box (and, ideally, that the geocoder's returned place/locality/borough is Manhattan / New York County). If a result falls **outside** Manhattan or fails validation, do **not** cache it as valid — store it with `Status = "needs_review"`, **exclude it from optimization** (fall back to the heuristic position for that stop), and surface it in the admin **Customers** tab as an address that needs correction.
  - Cache the `Status` (`ok` | `needs_review`) so flagged addresses are re-checked after the admin fixes them rather than silently trusted.
- **Optimize order:** build a travel-time **matrix** between the day's stops (Mapbox Matrix API), then run a local **TSP heuristic in JS** (nearest-neighbor seed + 2-opt improvement) — this avoids per-request stop-count caps and keeps cost ~$0. Respect hard constraints: **953 Columbus Ave stays last (uptown)**, permanent cycle stops and standing pickups remain, and any **manually saved drag order wins** (only reorder stops not pinned by the user).
- Expose as a server action / endpoint `app/api/route/optimize/route.js` (admin-PIN or driver-PIN authed) that returns the optimized order and **persists it** to `Route Order` (source `"optimizer"`). Gate the whole optimizer behind a `Settings` flag `route_optimizer_enabled` (default OFF) so it can't incur cost until you switch it on.

### 3c. "Optimize route" / "Re-optimize" buttons (item 5.4)
- Add an **Optimize route** button to the admin Route tab and a **Re-optimize** button to the driver "All stops" view. Both call the optimizer, then re-render. A manual drag afterward overrides it (existing save-order behavior). Show "Optimized by API" vs "Heuristic order" provenance, mirroring the existing `orderInfo.source` indicator.

### 3d. Full multi-stop map for the driver (item 5.3) — **additive, not a replacement**
- Add a **third view toggle** to `app/driver/page.js`: `Current` (existing, default) · `All stops` (existing) · **`Map` (new)**. The stop-by-stop hero flow must remain the default and unchanged.
- The Map view renders all stops as numbered pins in route order on an interactive map (Mapbox GL JS or a static map fallback), with the route polyline and tap-to-navigate (reuse `getDirections`). Show current/next stop highlighted. Must work on mobile.

**Acceptance:** removing/renaming a street no longer requires editing two files; with the flag OFF everything behaves as today (heuristic order, no external calls); with it ON, optimizing produces a sensible order, keeps 953 Columbus last, respects manual pins, and persists; driver gets a working Map view without losing the stop-by-stop flow.

---

# PHASE 4 — Learn real stop times from history + outlier detection (item 5.2)

**Problem being fixed:** ETAs are calibrated to a single hardcoded historical day (`stopToStopMinutes` in `app/driver/page.js`, comment "May 23"). Use the operation's own history instead — but guard against bad driver data.

- Add `lib/eta-model.js`. Source data: completed routes from `Driver Progress` (per-stop `statusTime`) joined with the final ordered routes, plus `/api/driver-stats` aggregates. Compute, per **segment class** (same building / same side near / same side far / cross-side) and per-building service time, a **robust central estimate** (median, not mean).
- **Outlier / data-quality detection (required).** The driver sometimes forgets to confirm stops, or marks everything done at once (before/after the route). Exclude bad signal before learning:
  - **Bulk-confirm detection:** if a run has ≥K stops whose `statusTime` fall within a tiny window (e.g., ≥3 stops within <60s, or a large fraction of the route sharing near-identical timestamps), flag that **route as unreliable for timing** and exclude its segment times from the model (still count it for collection totals).
  - **Implausible gaps:** drop individual segment durations that are `≤0`, below a floor (e.g., <30s between *different* buildings), or above a ceiling (e.g., >45 min between adjacent stops → driver paused/forgot then resumed).
  - **IQR filter:** within each segment class, drop durations outside `[Q1 − 1.5·IQR, Q3 + 1.5·IQR]`.
  - **Minimum sample size:** require ≥N clean samples per segment class before trusting the learned value; otherwise fall back to the current calibrated constants. Never let one bad week swing estimates.
- Surface a **data-quality line** in the Analytics tab: "X of Y routes used for timing (Z excluded as outliers)" so you can see when data is being filtered.
- Replace the hardcoded `stopToStopMinutes` constants in the driver ETA code with values from `lib/eta-model.js` (compute server-side and return a compact timing profile from `/api/driver/route`, or expose a small `/api/eta-model` the client reads). The same learned matrix should feed the Phase 3 optimizer's time estimates when available.

**Acceptance:** ETAs reflect recent real pace; a simulated "all stops confirmed within 10 seconds" route is detected and excluded (verify with a unit test or a scripted fixture); with insufficient clean data the system falls back to today's constants without errors.

---

# PHASE 5 — Admin visibility into drop-off photos (from item 4.7)

**Problem being fixed:** drop-off proof photos are captured by the driver and stored (`logDropoffPhoto` → `Dropoff Photos` tab, Cloudinary), but **the admin has no way to see them**. The live-tracking endpoint only joins `Driver Issues`.

- In `lib/sheets.js`, add `getDropoffsForRoute(area, weekId, day)` (mirror the existing `getIssuesForRoute` in `app/api/admin/driver-tracking/route.js`, but read the `Dropoff Photos` tab).
- Update `app/api/admin/driver-tracking/route.js` to also fetch drop-off photos and attach `dropoffPhotoUrl` to each stop (matched by address+unit), alongside the existing issue `photoUrl`.
- In the admin Live Tracking UI, show the drop-off photo thumbnail for drop-off stops (open in the existing lightbox). Distinguish issue photos (intercom/door) from drop-off proof photos with a small label.
- In the **Customers** tab drawer (Phase 1), add a "Drop-off proof" gallery using `getDropoffPhotos(area, address, unit)` so you can resolve "where did you leave my bag?" disputes by address.
- Respect existing Cloudinary retention (drop-offs kept 90 days); if a photo URL is expired/missing, show a graceful placeholder.

**Acceptance:** on a Day-2 route with a captured drop-off photo, the admin sees the thumbnail in Live Tracking and in the customer's history; issue photos and drop-off photos are visually distinguished.

---

# PHASE 6 — Live "driver is ~N min away" customer alert  ✅ APPROVED (email)

**Status:** Approved and shippable. Build it behind an admin-controlled `Settings` flag `eta_alerts_enabled` for operational control, **default `"false"` on first deploy** (so it doesn't fire during testing) — the admin turns it ON from the Settings tab when ready. This is email-only (SMS is out of scope for now).

- **Primary mode — live approach alert:** as the driver completes stops, when a confirmed customer's stop is approximately **N stops / ~M minutes away** (use the Phase 4 ETA model), send that customer **one** branded email: "Your pickup is coming up — driver is about M minutes away (estimated window 9:40–10:10 AM). Please have your bag out." Make `N`/`M` configurable in Settings (e.g., trigger when ~3 stops / ~20 min out).
- Dedupe so each customer gets at most one alert per route (configurable); never alert opted-out addresses (`getOptOuts`) or addresses that already errored/bounced.
- **Secondary mode — "morning window":** also implement a single early-AM email per confirmed customer with their estimated time window, selectable in Settings as an alternative to the live alert. (Rationale to note in the Settings UI: email has delivery + inbox-watching lag, so for a true real-time heads-up the morning-window email is often more dependable; the live mode is best-effort.)
- Implementation: trigger the live mode from the driver progress update path (`/api/driver/progress`) — when a stop is marked done, recompute ETAs and fire any newly-due alerts — or a short polling job. Reuse `sendEmail`/`sendBccEmail` and the Phase 2 branded template. Log every send to a new `ETA Alerts` tab for dedupe + audit. Brand the email with the green theme and include the unsubscribe/opt-out link.

**Acceptance:** with the flag OFF no alerts are sent; with it ON, each confirmed customer receives exactly one window/approach email per route, opt-outs and bounced addresses are excluded, and sends are logged to `ETA Alerts`; verify against the Phase 4 ETA model (alerts fire at the configured lead time, not too early/late).

---

## New environment variables
- `CONFIRM_SECRET` — HMAC secret for one-tap confirm tokens (Phase 2).
- `MAPBOX_TOKEN` — Mapbox token for geocoding/matrix/maps (Phase 3). (Or `GOOGLE_MAPS_API_KEY` if you choose Google instead.)
- No new secret needed for Phases 1/4/5.

## New Google Sheet tabs (auto-create with the existing `ensure*Tab` pattern)
- `Geocache` (Phase 3): `Address | Lat | Lng | UpdatedAt | Status` (Status = `ok` | `needs_review` for out-of-Manhattan/failed lookups)
- `ETA Alerts` (Phase 6): `Week ID | Area | Day | Email | Sent At`

## Non-goals (explicitly skip)
SMS/text reminders · "you're on unless you reply STOP" regulars automation · customer preference/pause page · auto drop-off proof *to the customer* · weather nudges · parking/one-way/building-cluster modeling · payments/billing · merging admin+driver into one app · WhatsApp · migrating off Google Sheets.

## Suggested execution order
Phase 0 → 1 → 2 → 3a/3d → 4 → 3b/3c → 5 → 6. Ship and verify each phase independently; keep the cron untouched throughout. (Phase 6 depends on Phase 4's ETA model, so do it after 4.)

## Cost & capacity notes (for the implementer)
- **Resend:** the operation is on the **Pro plan** ($20/mo, 50,000 emails, no daily cap). Current reminder volume is ~4,000–6,000/mo; adding live ETA alerts (~one per confirmed customer per route, ~500–1,500/mo) keeps total well under 50,000 — no upgrade needed. Always filter opt-outs/bounces before sending.
- **Mapbox:** free tier is 100,000/mo each for Geocoding, Matrix, and Optimization. Usage here is a few hundred calls/mo (geocode-once-and-cache + ~4 routes/week), so effectively $0. Optimizer uses Matrix + a local TSP solver (not Mapbox's 12-stop Optimization endpoint) to handle longer routes. Keep behind a provider interface so Google can be swapped if ever needed.
