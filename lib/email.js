import { Resend } from "resend";
import { makeToken } from "./confirm-token.js";

const DEFAULT_FROM = process.env.EMAIL_FROM || '"Laundry Day" <pickups@laundryday.nyc>';
// Reply-To: empty by default so replies go to From (pickups@laundryday.nyc) and
// are forwarded by Porkbun to laundrydaynyc@gmail.com. This avoids the
// FREEMAIL_FORGED_REPLYTO spam signal that SpamAssassin penalizes.
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO || "";

// Resend's batch.send accepts up to 100 individual emails per API call.
// We use 50 per batch as defense-in-depth: smaller batches mean less data loss
// if a single API call fails, and they're faster individually (less timeout risk).
const BATCH_API_SIZE = 50;

// Retry transient errors (rate limit, 5xx, timeouts) with exponential backoff
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1500;

function isTransientError(errorMsg) {
  if (!errorMsg) return false;
  return /rate.?limit|429|5\d\d|timeout|temporar|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(errorMsg);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await fn();
      if (result?.error) {
        const msg = result.error.message || JSON.stringify(result.error);
        if (!isTransientError(msg) || attempt === MAX_RETRY_ATTEMPTS) return result;
        console.warn(`[${label}] Transient error attempt ${attempt}: ${msg}, retrying...`);
        lastError = result.error;
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      return result;
    } catch (e) {
      lastError = e;
      if (!isTransientError(e.message) || attempt === MAX_RETRY_ATTEMPTS) throw e;
      console.warn(`[${label}] Transient exception attempt ${attempt}: ${e.message}, retrying...`);
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }
  if (lastError) throw lastError;
}

let _resend = null;
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY env var not set");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// Send a single email (one recipient, no batching) with retry on transient errors
async function sendEmail({ to, subject, text, html, replyTo }) {
  const resend = getResend();
  const payload = {
    from: DEFAULT_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html,
  };
  const rt = replyTo ?? DEFAULT_REPLY_TO;
  if (rt) payload.replyTo = rt;
  const result = await callWithRetry("sendEmail", () => resend.emails.send(payload));
  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message || JSON.stringify(result.error)}`);
  }
  return result.data;
}

// Build the per-recipient one-tap confirm URL. Returns "" if CONFIRM_SECRET
// isn't set (the templates then keep falling back to /pickup?area=… for typing).
function buildConfirmLink(baseUrl, recipient, area, week, day) {
  if (!process.env.CONFIRM_SECRET || !area || !week || !day) return "";
  try {
    const t = makeToken({ email: recipient, day, area, week });
    return `${baseUrl}/api/confirm?e=${encodeURIComponent(recipient)}&day=${encodeURIComponent(day)}&area=${encodeURIComponent(area)}&w=${encodeURIComponent(week)}&t=${t}`;
  } catch {
    return "";
  }
}

// Send the same email to many recipients using Resend's batch.send (one personalized
// email per recipient, no BCC). This avoids the "To: self + BCC" pattern that triggers
// bounces when the self-address gets forwarded by a third party.
// Each recipient is tracked individually in Resend's dashboard.
//
// `linkContext` (optional, Phase 2 one-tap): { area, week, day1, day2 } — when
// provided, the placeholders {{CONFIRM_LINK}}, {{CONFIRM_LINK_DAY1}}, and
// {{CONFIRM_LINK_DAY2}} get filled per recipient with HMAC-signed links so the
// customer can confirm with one tap (no typing). `day` here is the single
// confirm-day used by remaining/today emails; `day1`/`day2` are the pair used
// by the main reminder.
async function sendBccEmail({ recipients, subject, text, html, replyTo, linkContext }) {
  if (!recipients || recipients.length === 0) {
    return { sent: 0, batches: 0, skipped: "no recipients", errors: [] };
  }
  const resend = getResend();
  const from = DEFAULT_FROM;
  const rt = replyTo ?? DEFAULT_REPLY_TO;

  let sent = 0;
  let batches = 0;
  const errors = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pickup.laundryday.nyc";
  const ctx = linkContext || {};

  for (let i = 0; i < recipients.length; i += BATCH_API_SIZE) {
    const batch = recipients.slice(i, i + BATCH_API_SIZE);
    const payloads = batch.map((recipient) => {
      const unsubLink = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(recipient)}`;
      const confirm = ctx.day ? buildConfirmLink(baseUrl, recipient, ctx.area, ctx.week, ctx.day) : "";
      const confirmDay1 = ctx.day1 ? buildConfirmLink(baseUrl, recipient, ctx.area, ctx.week, ctx.day1) : "";
      const confirmDay2 = ctx.day2 ? buildConfirmLink(baseUrl, recipient, ctx.area, ctx.week, ctx.day2) : "";
      // Fallbacks if CONFIRM_SECRET isn't set — keep links functional via the type-email page.
      const fallbackPickup = `${baseUrl}/pickup?area=${encodeURIComponent(ctx.area || "")}`;
      const replace = (s) =>
        (s || "")
          .replaceAll("{{UNSUBSCRIBE_LINK}}", unsubLink)
          .replaceAll("{{CONFIRM_LINK}}", confirm || `${fallbackPickup}&day=${encodeURIComponent(ctx.day || "")}`)
          .replaceAll("{{CONFIRM_LINK_DAY1}}", confirmDay1 || `${fallbackPickup}&day=${encodeURIComponent(ctx.day1 || "")}`)
          .replaceAll("{{CONFIRM_LINK_DAY2}}", confirmDay2 || `${fallbackPickup}&day=${encodeURIComponent(ctx.day2 || "")}`);
      const p = { from, to: [recipient], subject, text: replace(text), html: replace(html) };
      if (rt) p.replyTo = rt;
      return p;
    });
    try {
      const result = await callWithRetry(`batch-${batches + 1}`, () => resend.batch.send(payloads));
      if (result.error) {
        errors.push(`Batch ${batches + 1}: ${result.error.message || JSON.stringify(result.error)}`);
      } else {
        sent += batch.length;
      }
    } catch (e) {
      errors.push(`Batch ${batches + 1} (after ${MAX_RETRY_ATTEMPTS} retries): ${e.message}`);
    }
    batches += 1;
  }

  return { sent, batches, errors };
}

export { sendEmail, sendBccEmail, DEFAULT_FROM, DEFAULT_REPLY_TO };
