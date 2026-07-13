import { NextResponse } from "next/server";
import { logBounceEvent, addOptOut } from "../../../../lib/sheets";

export const dynamic = "force-dynamic";

// POST /api/webhooks/resend — receives Resend webhook events
// Configure in Resend dashboard → Webhooks → endpoint URL: https://pickup.laundryday.nyc/api/webhooks/resend
// Subscribe to events: email.bounced, email.complained, email.delivery_delayed
//
// Optional signature verification: set RESEND_WEBHOOK_SECRET env var (from Resend dashboard).
// If unset, all incoming POSTs are accepted (use only if you trust the URL is unguessable).
export async function POST(request) {
  // Verify signature if secret is configured
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const rawBody = await request.text();

  if (secret) {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
    }
    // Resend uses Svix for webhooks — signature format: v1,<base64-hmac-sha256>
    // Verify: HMAC-SHA256(secret, `${svixId}.${svixTimestamp}.${rawBody}`)
    try {
      const crypto = await import("crypto");
      const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
      const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
      const expectedSig = crypto
        .createHmac("sha256", secretBytes)
        .update(signedPayload)
        .digest("base64");
      const provided = svixSignature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
      const ok = provided.some((s) => crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expectedSig)));
      if (!ok) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } catch (e) {
      console.warn("Signature verification failed:", e.message);
      // Fail closed — better to drop than process unverified events
      return NextResponse.json({ error: "Signature verification error" }, { status: 401 });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const type = event.type;
    const data = event.data || {};
    const email = Array.isArray(data.to) ? data.to[0] : data.to;
    const subject = data.subject || "";

    if (type === "email.bounced") {
      const bounce = data.bounce || {};
      await logBounceEvent({
        email,
        eventType: "bounced",
        subject,
        bounceType: bounce.type || "",
        reason: bounce.message || "",
      });
      // Hard bounces → auto opt-out (recipient never reachable)
      if ((bounce.type || "").toLowerCase().includes("hard")) {
        await addOptOut(email, "auto-bounce");
      }
    } else if (type === "email.complained") {
      await logBounceEvent({
        email,
        eventType: "complained",
        subject,
        bounceType: "complaint",
        reason: "Marked as spam by recipient",
      });
      // Complaints → auto opt-out
      await addOptOut(email, "auto-complaint");
    } else if (type === "email.delivery_delayed") {
      await logBounceEvent({
        email,
        eventType: "delayed",
        subject,
        bounceType: "delayed",
        reason: data.delivery?.attempt || "Transient delivery issue",
      });
    }
    // Ignore other event types (sent, delivered, opened, clicked) — not actionable

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
