// ── Customer email template kit (green-brand redesign, light + dark) ────────
// Owner-approved redesign goals:
//   • Sage / leaf-green brand aligned to lib/theme.js (replaces the old indigo).
//   • A logo masthead centered at the very top of the email.
//   • One pickup day pre-highlighted (filled), the other outlined.
//   • Looks polished in BOTH light AND dark mode.
//
// Why dark mode works now (it didn't before):
//   The previous build shipped light-only because Gmail's iOS app ignores email
//   dark CSS and *algorithmically inverts* — which turned the old pale-indigo
//   filled button into an illegible washed-out chip. The fix is twofold:
//     1. We OPT IN to dark handling (color-scheme: light dark) and ship a full
//        hand-built dark palette via @media (prefers-color-scheme: dark). Apple
//        Mail (iOS/macOS), Outlook.com and modern Gmail web honor this and render
//        our intended dark look.
//     2. For clients that force-invert anyway (Gmail iOS/Android app), the
//        primary button uses a SATURATED mid-tone green with white text. Gmail's
//        inversion leaves saturated colors alone (it only flips near-white /
//        near-black), so the call-to-action stays green-with-white and legible no
//        matter how the client treats the rest of the message.
//   Net result: one design that reads correctly across light, true-dark, and
//   force-inverted clients.

export const TOKENS = {
  light: {
    page: "#EEF2E8",
    card: "#FFFFFF",
    cardBorder: "#E4EADB",
    accent: "#4E7D3F",
    h1: "#16210F",
    muted: "#5E6B54",
    wordmark: "#2F4A22",
    primaryFill: "#3C7A33",   // saturated leaf green — white text passes AA on large text
    primaryText: "#FFFFFF",
    primaryIcon: "#D6ECC9",
    primarySub: "#D6ECC9",
    secondaryFill: "#FFFFFF",
    secondaryBorder: "#4E7D3F",
    secondaryDay: "#2F5E26",
    secondaryIcon: "#4E7D3F",
    secondaryArrow: "#4E7D3F",
    secondarySub: "#5E6B54",
    reassurance: "#8A9580",
    calloutBg: "#EAF3E2",
    calloutIcon: "#4E7D3F",
    calloutText: "#2F4A22",
    calloutTextStrong: "#16210F",
    footerTeam: "#4E7D3F",
    footerContact: "#8A9580",
    footerFine: "#A7B09C",
  },
  dark: {
    page: "#0F140D",
    card: "#182114",
    cardBorder: "#2B3525",
    accent: "#8FCB73",
    h1: "#EAF2E2",
    muted: "#9CA992",
    wordmark: "#DCEBD0",
    primaryFill: "#4C8F3F",   // a touch brighter so it pops on the dark card
    primaryText: "#FFFFFF",
    primaryIcon: "#CFE8C0",
    primarySub: "#CFE8C0",
    secondaryFill: "#1C2717",
    secondaryBorder: "#5E9A4A",
    secondaryDay: "#C3E0B2",
    secondaryIcon: "#8FCB73",
    secondaryArrow: "#8FCB73",
    secondarySub: "#9CA992",
    reassurance: "#6F7A66",
    calloutBg: "#1C2717",
    calloutIcon: "#8FCB73",
    calloutText: "#CDE3BE",
    calloutTextStrong: "#FFFFFF",
    footerTeam: "#8FCB73",
    footerContact: "#7A8570",
    footerFine: "#5C6553",
  },
};

const L = TOKENS.light;
const D = TOKENS.dark;
const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`;
const TERMS_URL = "https://laundryday.nyc/assets/partnerassets/documents/Terms%20Of%20Service.pdf";

// ── Brand logo ──────────────────────────────────────────────────────────
// Email clients strip inline/base64 images, so the logo must be a HOSTED url.
// Upload your watercolor leaf PNG (transparent background, ~240px wide for 2×)
// to your existing Cloudinary "email-icons" folder, then this URL just works.
// To change it, edit LOGO_URL below (or set EMAIL_LOGO_URL in the environment).
// A transparent-background leaf reads well on both the white (light) and dark
// cards, so a single asset covers both modes.
const LOGO_URL =
  (typeof process !== "undefined" && process.env && process.env.EMAIL_LOGO_URL) ||
  "https://res.cloudinary.com/dqi32bxkh/image/upload/f_png,w_240/laundry/email-icons/leaf-logo.png";
const LOGO_WIDTH = 56;   // displayed width in px
const LOGO_HEIGHT = 56;
const WORDMARK = "Laundry Day";

// Hosted PNG icons (Gmail strips inline SVG). Served as retina PNGs from
// Cloudinary. Note: the small calendar/clock/lock glyphs below are the OLD
// indigo-tinted assets. They still read fine, but for a perfect match you can
// re-upload green-tinted versions at the same paths — the template needs no
// change. Colors are also legible on the dark palette.
const ICON_BASE = "https://res.cloudinary.com/dqi32bxkh/image/upload";
const ICONS = {
  calendarPrimary: `${ICON_BASE}/f_png,w_44,h_44/laundry/email-icons/calendar-primary.png`,
  calendarSecondary: `${ICON_BASE}/f_png,w_44,h_44/laundry/email-icons/calendar-secondary.png`,
  clock: `${ICON_BASE}/f_png,w_38,h_38/laundry/email-icons/clock-accent.png`,
  lock: `${ICON_BASE}/f_png,w_28,h_28/laundry/email-icons/lock-muted.png`,
};
function iconImg(src, size, alt = "") {
  return `<img src="${src}" width="${size}" height="${size}" alt="${esc(alt)}" style="display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />`;
}

// Re-export for callers that read it under the old name.
export const PALETTE = {
  paper: L.page,
  surface: L.card,
  hairline: L.cardBorder,
  primary: L.accent,
  primarySoft: L.calloutBg,
  primaryInk: L.calloutText,
  ink: L.h1,
  inkSoft: L.muted,
  inkMuted: L.muted,
  primaryDeep: L.secondaryDay,
};

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function preheaderHtml(text) {
  return `
  <div style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;color:${L.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${esc(text)}${"&zwnj;&nbsp;".repeat(60)}
  </div>`;
}

// ── Logo masthead — centered, above the card ────────────────────────────
function logoHeader() {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 18px;">
      <tr><td align="center" style="text-align:center;padding:0;">
        <img src="${LOGO_URL}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="${esc(WORDMARK)}"
             style="display:block;margin:0 auto 8px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
        <div class="ldn-wordmark" style="font-family:${FONT};font-size:15px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:${L.wordmark};line-height:1;">
          ${esc(WORDMARK)}
        </div>
      </td></tr>
    </table>`;
}

// ── htmlShell ────────────────────────────────────────────────────────────
export function htmlShell(innerHtml, { preheader = "", title = "Laundry Day NYC" } = {}) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${esc(title)}</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }

    /* Reset */
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    a { text-decoration:none; }
    body { margin:0 !important; padding:0 !important; width:100% !important; }

    /* Kill iOS data-detector auto-link styling + Gmail's link underline */
    .ldn-no-auto a { color:inherit !important; text-decoration:none !important; }
    u + #body a { color:inherit; text-decoration:none; }
    #MessageViewBody a { color:inherit; text-decoration:none; }

    /* Mobile — single column, same structure, just tighter padding */
    @media only screen and (max-width:600px) {
      .ldn-card-outer { padding-left:14px !important; padding-right:14px !important; padding-top:24px !important; }
      .ldn-card-pad { padding-left:18px !important; padding-right:18px !important; padding-top:26px !important; padding-bottom:26px !important; }
      .ldn-h1 { font-size:23px !important; }
    }

    /* ── DARK MODE ───────────────────────────────────────────────────────
       Honored by Apple Mail (iOS/macOS), Outlook.com, modern Gmail web, etc.
       Every color is forced with !important so it beats the inline light
       styles. Inner <u>/<font> shims inside the day cards are overridden too,
       since Gmail bakes link colors into those elements. */
    @media (prefers-color-scheme: dark) {
      body, .ldn-page, .ldn-page table, table.ldn-page { background-color:${D.page} !important; }
      .ldn-card { background-color:${D.card} !important; border-color:${D.cardBorder} !important; }

      .ldn-wordmark { color:${D.wordmark} !important; }
      .ldn-eyebrow { color:${D.accent} !important; }
      .ldn-h1, .ldn-h1 * { color:${D.h1} !important; }
      .ldn-muted, .ldn-muted * { color:${D.muted} !important; }

      .ldn-primary-card { background-color:${D.primaryFill} !important; }
      .ldn-primary-card-text, .ldn-primary-card-text u, .ldn-primary-card-text font { color:${D.primaryText} !important; }
      .ldn-primary-card-sub, .ldn-primary-card-sub u, .ldn-primary-card-sub font { color:${D.primarySub} !important; }

      .ldn-secondary-card { background-color:${D.secondaryFill} !important; border-color:${D.secondaryBorder} !important; }
      .ldn-secondary-card-text, .ldn-secondary-card-text u, .ldn-secondary-card-text font { color:${D.secondaryDay} !important; }
      .ldn-secondary-card-sub, .ldn-secondary-card-sub u, .ldn-secondary-card-sub font { color:${D.secondarySub} !important; }
      .ldn-secondary-card-arrow, .ldn-secondary-card-arrow u, .ldn-secondary-card-arrow font { color:${D.secondaryArrow} !important; }

      .ldn-reassurance { color:${D.reassurance} !important; }
      .ldn-callout { background-color:${D.calloutBg} !important; }
      .ldn-callout-text, .ldn-callout-text * { color:${D.calloutText} !important; }
      .ldn-callout-strong { color:${D.calloutTextStrong} !important; }

      .ldn-footer-team, .ldn-footer-team * { color:${D.footerTeam} !important; }
      .ldn-footer-contact, .ldn-footer-contact * { color:${D.footerContact} !important; }
      .ldn-footer-fine, .ldn-footer-fine * { color:${D.footerFine} !important; }
    }
  </style>
</head>
<body id="body" class="ldn-page ldn-no-auto" style="margin:0;padding:0;width:100%;background-color:${L.page};font-family:${FONT};color:${L.h1};">
  ${preheader ? preheaderHtml(preheader) : ""}
  <table role="presentation" class="ldn-page" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${L.page};">
    <tr>
      <td class="ldn-card-outer" align="center" valign="top" style="padding:36px 16px 16px;">

        ${logoHeader()}

        <!-- Card -->
        <table role="presentation" class="ldn-card" cellspacing="0" cellpadding="0" border="0" width="600" style="width:100%;max-width:600px;background-color:${L.card};border:0.5px solid ${L.cardBorder};border-radius:18px;">
          <tr><td class="ldn-card-pad" align="center" style="padding:32px 28px;">
            ${innerHtml}
          </td></tr>
        </table>

        ${footerHtml()}

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Day card — the full-width tappable confirm card ─────────────────────
// variant: "primary" (filled accent) | "secondary" (outlined accent)
export function buildDayCard(href, dayName, variant = "primary") {
  const safeDay = esc(dayName);
  const v = variant === "primary"
    ? {
        fill: L.primaryFill, border: null, icon: ICONS.calendarPrimary,
        dayColor: L.primaryText, subColor: L.primarySub, arrowColor: L.primaryText,
        cardClass: "ldn-primary-card", dayClass: "ldn-primary-card-text",
        subClass: "ldn-primary-card-sub", arrowClass: "ldn-primary-card-text",
        vmlStroke: L.primaryFill, vmlFill: L.primaryFill, vmlText: "#FFFFFF", vmlWeight: 0,
      }
    : {
        fill: L.secondaryFill, border: L.secondaryBorder, icon: ICONS.calendarSecondary,
        dayColor: L.secondaryDay, subColor: L.secondarySub, arrowColor: L.secondaryArrow,
        cardClass: "ldn-secondary-card", dayClass: "ldn-secondary-card-text",
        subClass: "ldn-secondary-card-sub", arrowClass: "ldn-secondary-card-arrow",
        vmlStroke: L.secondaryBorder, vmlFill: L.secondaryFill, vmlText: L.secondaryDay, vmlWeight: 1.5,
      };
  const borderCss = v.border ? `border:1.5px solid ${v.border};` : "";
  // shim() wraps every text node in <u><font> so Gmail can't recolor link text
  // (it does this in light mode too, not just dark). The dark-mode CSS above
  // re-targets these <u>/<font> elements by class so dark overrides still apply.
  const shim = (color, cls, sizePx, weight, lh, text) =>
    `<span class="${cls}" style="font-family:${FONT};font-size:${sizePx}px;font-weight:${weight};line-height:${lh}px;color:${color};mso-line-height-rule:exactly;"><u style="text-decoration:none;color:${color};"><font color="${color}">${text}</font></u></span>`;

  return `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                 href="${href}" style="height:60px;v-text-anchor:middle;width:520px;" arcsize="22%"
                 strokecolor="${v.vmlStroke}" fillcolor="${v.vmlFill}"${v.vmlWeight ? ` strokeweight="${v.vmlWeight}pt"` : ""}>
      <w:anchorlock/>
      <center style="color:${v.vmlText};font-family:${FONT};font-size:17px;font-weight:bold;">${safeDay}&nbsp;&nbsp;&rarr;</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${href}" target="_blank" class="${v.cardClass}"
       style="display:block;background-color:${v.fill};${borderCss}border-radius:14px;text-decoration:none;mso-line-height-rule:exactly;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td valign="middle" width="22" style="width:22px;padding:16px 0 16px 18px;font-size:0;line-height:0;">
            ${iconImg(v.icon, 22)}
          </td>
          <td valign="middle" align="left" style="padding:16px 0 16px 13px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr><td style="padding:0;mso-line-height-rule:exactly;">
                ${shim(v.dayColor, v.dayClass, 17, 700, 22, safeDay)}
              </td></tr>
              <tr><td style="padding:2px 0 0;mso-line-height-rule:exactly;">
                ${shim(v.subColor, v.subClass, 12, 400, 15, "Tap to confirm")}
              </td></tr>
            </table>
          </td>
          <td valign="middle" align="right" width="26" style="width:26px;padding:16px 18px 16px 0;">
            ${shim(v.arrowColor, v.arrowClass, 20, 400, 20, "&rarr;")}
          </td>
        </tr>
      </table>
    </a>
    <!--<![endif]-->`;
}

// ── Footer (below the card) ──────────────────────────────────────────────
function footerHtml() {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center" style="width:100%;max-width:600px;margin:0 auto;">
      <tr><td align="center" style="padding:20px 18px 8px;text-align:center;">
        <p class="ldn-footer-team" style="margin:0 0 6px;font-family:${FONT};font-size:13px;font-weight:500;color:${L.footerTeam};line-height:1;">
          The Laundry Day Team
        </p>
        <p class="ldn-footer-contact" style="margin:0;font-family:${FONT};font-size:12px;color:${L.footerContact};line-height:1.7;">
          <a href="tel:+16467050600" style="color:${L.footerContact};text-decoration:none;"><u style="text-decoration:none;color:${L.footerContact};">(646)&nbsp;705-0600</u></a>
          <span style="color:${L.footerContact};"> · </span>
          <a href="mailto:laundrydaynyc@gmail.com" style="color:${L.footerContact};text-decoration:underline;"><u style="color:${L.footerContact};">laundrydaynyc@gmail.com</u></a>
          <br/>
          <a href="https://laundryday.nyc" style="color:${L.footerContact};text-decoration:underline;"><u style="color:${L.footerContact};">laundryday.nyc</u></a>
          <span style="color:${L.footerContact};"> · </span>
          <a href="${TERMS_URL}" style="color:${L.footerContact};text-decoration:underline;"><u style="color:${L.footerContact};">Terms of Service</u></a>
        </p>
        <p class="ldn-footer-fine" style="margin:9px 0 0;font-family:${FONT};font-size:11px;color:${L.footerFine};line-height:1.55;">
          Don't need a pickup this week? No action needed.
          <span style="color:${L.footerFine};"> · </span>
          <a href="{{UNSUBSCRIBE_LINK}}" style="color:${L.footerFine};text-decoration:underline;"><u style="color:${L.footerFine};">Unsubscribe</u></a>
        </p>
      </td></tr>
    </table>`;
}

// ── Plain-text signature ─────────────────────────────────────────────────
export const SIGNATURE_TEXT = `
--
The Laundry Day Team
(646) 705-0600 · laundrydaynyc@gmail.com
laundryday.nyc · Terms: ${TERMS_URL}

Don't need a pickup this week? No action needed.
Unsubscribe: {{UNSUBSCRIBE_LINK}}
`.trim();

export const TERMS_URL_EXPORT = TERMS_URL;

// ─── Back-compat exports — older callers still import these ────────────
export function buildButton(href, label = "Confirm") {
  // Maps to the new primary day-card style so anything that called the old
  // single-CTA helper still produces a properly-styled email element.
  return buildDayCard(href, label, "primary");
}
export function buildButtonPair() {
  throw new Error("buildButtonPair is replaced by buildDayCard — use it directly inside the email composition.");
}
export function buildCallout(content, { tone = "info" } = {}) {
  return `
    <table role="presentation" class="ldn-callout" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${L.calloutBg};border-radius:12px;">
      <tr><td valign="top" style="padding:13px 15px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td valign="middle" width="22" style="width:22px;font-size:0;line-height:0;padding-right:10px;">
              ${iconImg(ICONS.clock, 19)}
            </td>
            <td valign="middle" class="ldn-callout-text" style="font-family:${FONT};font-size:13px;line-height:1.5;color:${L.calloutText};">
              ${content}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>`;
}
export function heroBlock({ eyebrow, title, sub }) {
  return `
    ${eyebrow ? `<p class="ldn-eyebrow" style="margin:0 0 18px;font-family:${FONT};font-size:11px;font-weight:500;letter-spacing:1.6px;color:${L.accent};line-height:1;text-transform:uppercase;text-align:center;">${esc(eyebrow)}</p>` : ""}
    <h1 class="ldn-h1" style="margin:0 0 9px;font-family:${FONT};font-size:25px;font-weight:700;color:${L.h1};line-height:1.2;text-align:center;letter-spacing:-0.2px;">${title}</h1>
    ${sub ? `<p class="ldn-muted" style="margin:0 0 22px;font-family:${FONT};font-size:15px;font-weight:400;color:${L.muted};line-height:1.55;text-align:center;">${sub}</p>` : ""}`;
}
export function section(innerHtml, _opts) { return innerHtml; }
export function buildReassurance(text) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 20px;">
      <tr>
        <td valign="middle" style="font-size:0;line-height:0;padding-right:7px;">
          ${iconImg(ICONS.lock, 14)}
        </td>
        <td valign="middle" class="ldn-reassurance" style="font-family:${FONT};font-size:12px;color:${L.reassurance};line-height:1;">
          ${esc(text)}
        </td>
      </tr>
    </table>`;
}
export function successGlyph() {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 14px;">
      <tr><td bgcolor="${L.calloutBg}" align="center" valign="middle" width="60" height="60" class="ldn-callout"
              style="width:60px;height:60px;background-color:${L.calloutBg};border-radius:30px;line-height:60px;">
        <span class="ldn-callout-strong" style="font-family:${FONT};font-size:28px;font-weight:700;color:${L.accent};line-height:60px;mso-line-height-rule:exactly;">&#10003;</span>
      </td></tr>
    </table>`;
}

// ─────────────────────────────────────────────────────────────────────────
// CUSTOMER EMAIL BUILDERS
// ─────────────────────────────────────────────────────────────────────────

const AREA_LABELS = {
  uptown: { day1: "Friday", day2: "Saturday" },
  downtown: { day1: "Tuesday", day2: "Thursday" },
};

// Weekly reminder — two-day choice, day1=primary card, day2=secondary card.
export function buildMainEmail(area) {
  const cfg = AREA_LABELS[area];
  if (!cfg) throw new Error("Invalid area");
  const subject = `Confirm your pickup this week`;
  const preheader = `${cfg.day1} or ${cfg.day2}? Tap one card — bag out by 10 AM on your day.`;
  const text = [
    `Confirm your pickup`,
    ``,
    `Choose the day that works for you this week. One tap — nothing to type.`,
    ``,
    `Confirm ${cfg.day1}: {{CONFIRM_LINK_DAY1}}`,
    `Confirm ${cfg.day2}: {{CONFIRM_LINK_DAY2}}`,
    ``,
    `Each link is secured to your email address.`,
    ``,
    `Please have your bag outside by 10 AM on your pickup day.`,
    ``,
    SIGNATURE_TEXT,
  ].join("\n");

  const inner = `
    ${heroBlock({
      eyebrow: "Weekly pickup",
      title: "Confirm your pickup",
      sub: `Choose the day that works for you this week. One&nbsp;tap — nothing to type.`,
    })}

    <!-- Day cards stacked -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 18px;">
      <tr><td style="padding-bottom:11px;">${buildDayCard("{{CONFIRM_LINK_DAY1}}", cfg.day1, "primary")}</td></tr>
      <tr><td>${buildDayCard("{{CONFIRM_LINK_DAY2}}", cfg.day2, "secondary")}</td></tr>
    </table>

    ${buildReassurance("Each link is secured to your email address.")}

    ${buildCallout(`Please have your bag outside by <strong class="ldn-callout-strong" style="font-weight:500;color:${L.calloutText};">10&nbsp;AM</strong> on your pickup day so our driver doesn't miss you.`)}
  `;

  return { subject, text, html: htmlShell(inner, { preheader, title: subject }) };
}

// "Pickup is today" — single primary card, single CTA.
export function buildRemainingEmail(area, todayDay) {
  const subject = `Pickup is today — confirm in one tap`;
  const preheader = `We're in your area today (${todayDay}). Tap to confirm — bag out by 10 AM.`;
  const text = [
    `Pickup is today`,
    ``,
    `We're collecting in your area today (${todayDay}). One tap confirms — no typing.`,
    ``,
    `Confirm: {{CONFIRM_LINK}}`,
    ``,
    `Each link is secured to your email address.`,
    `Please have your bag outside by 10 AM today.`,
    ``,
    SIGNATURE_TEXT,
  ].join("\n");

  const inner = `
    ${heroBlock({
      eyebrow: "Today's pickup",
      title: "Pickup is today",
      sub: `We're in your area today, <strong style="color:${L.h1};font-weight:500;">${esc(todayDay)}</strong>. One tap to confirm.`,
    })}

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 18px;">
      <tr><td>${buildDayCard("{{CONFIRM_LINK}}", todayDay, "primary")}</td></tr>
    </table>

    ${buildReassurance("Each link is secured to your email address.")}

    ${buildCallout(`Please have your bag outside by <strong class="ldn-callout-strong" style="font-weight:500;color:${L.calloutText};">10&nbsp;AM</strong> today so our driver doesn't miss you.`)}
  `;

  return { subject, text, html: htmlShell(inner, { preheader, title: subject }) };
}

// "You're confirmed" — success state. Check treatment replaces the eyebrow,
// no day cards. Keep callout + footer.
export function buildConfirmedEmail() {
  const subject = "You're confirmed for pickup today";
  const preheader = "All set. Bag outside by 10 AM and we'll handle the rest.";
  const text = [
    `You're confirmed`,
    ``,
    `Your pickup is confirmed for today. Have your bag outside by 10 AM and we'll handle the rest.`,
    ``,
    `Exact pickup times vary with the driver's route and traffic.`,
    ``,
    SIGNATURE_TEXT,
  ].join("\n");

  const inner = `
    ${successGlyph()}
    <h1 class="ldn-h1" style="margin:0 0 9px;font-family:${FONT};font-size:25px;font-weight:700;color:${L.h1};line-height:1.2;text-align:center;letter-spacing:-0.2px;">You're confirmed</h1>
    <p class="ldn-muted" style="margin:0 0 24px;font-family:${FONT};font-size:15px;font-weight:400;color:${L.muted};line-height:1.55;text-align:center;">
      Your pickup is on. Have your bag outside by <strong style="color:${L.h1};font-weight:500;">10&nbsp;AM</strong> — we'll handle the rest.
    </p>

    ${buildCallout(`Exact pickup times vary with the driver's route and traffic. Thanks for your patience.`)}
  `;

  return { subject, text, html: htmlShell(inner, { preheader, title: subject }) };
}
