// HMAC-signed one-tap confirmation tokens for reminder-email links.
// The customer's email is embedded in their personalized link and the
// signature ties identity to (email, day, area, week) — so a forwarded
// link can't be used to confirm someone else, and an old week's link
// can't be used in a future week.
//
// Server-only (uses node:crypto). Imported by sendBccEmail (per-recipient
// link substitution) and by /api/confirm (to verify incoming requests).

import crypto from "node:crypto";

function urlSafe(b64) {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function payload(email, day, area, week) {
  return [
    (email || "").toLowerCase().trim(),
    (day || "").toLowerCase().trim(),
    (area || "").toLowerCase().trim(),
    (week || "").toLowerCase().trim(),
  ].join("|");
}

function secret() {
  const s = process.env.CONFIRM_SECRET;
  if (!s) throw new Error("CONFIRM_SECRET not set");
  return s;
}

// Returns a URL-safe HMAC token. Truncated to 22 chars (≈128 bits) — plenty.
export function makeToken({ email, day, area, week }) {
  const hmac = crypto
    .createHmac("sha256", secret())
    .update(payload(email, day, area, week))
    .digest("base64");
  return urlSafe(hmac).slice(0, 22);
}

// Returns true if the given token matches what we'd compute from the inputs.
// Constant-time compare so timing attacks can't probe valid tokens.
export function verifyToken({ email, day, area, week }, token) {
  if (!token) return false;
  let expected;
  try {
    expected = makeToken({ email, day, area, week });
  } catch {
    return false;
  }
  if (expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
