import { NextResponse } from "next/server";
import {
  resolveWeekForDriverDay,
  mergeDriverProgress,
  logDriverIssue,
  findCustomerByAddress,
  getSetting,
  AREA_CONFIG,
} from "../../../../lib/sheets";
import { getAreaForPin } from "../../../../lib/driver-auth";
import { uploadPhoto } from "../../../../lib/cloudinary";
import { sendEmail } from "../../../../lib/email";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pickup.laundryday.nyc";
const TERMS_URL =
  "https://laundryday.nyc/assets/partnerassets/documents/Terms%20Of%20Service.pdf";

const SIGNATURE_HTML = `
<div style="border-top: 1px solid #eee; margin: 28px 0 0; padding: 22px 0 0; font-family: Arial, sans-serif; text-align: center;">
  <div style="color: #7CB342; font-weight: 700; font-size: 16px; margin-bottom: 8px;">The Laundry Day Team</div>
  <div style="font-size: 13px; color: #555; margin-bottom: 6px;">(646) 705-0600 &nbsp;·&nbsp; <a href="mailto:laundrydaynyc@gmail.com" style="color: #1a73e8; text-decoration: underline;">laundrydaynyc@gmail.com</a></div>
  <div style="font-size: 13px; margin-bottom: 4px;"><a href="https://laundryday.nyc" style="color: #1a73e8; text-decoration: underline;">Our Website</a></div>
  <div style="font-size: 13px;"><a href="${TERMS_URL}" style="color: #1a73e8; text-decoration: underline;">Terms &amp; Services</a></div>
</div>`;

function formatET(date) {
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function shellHtml(inner) {
  return `<div style="background: #f4f6f3; padding: 20px 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.04); padding: 8px 28px 28px;">
    <div style="text-align: center; padding: 24px 0 0;">
      <div style="display: inline-block; height: 3px; width: 40px; background: #7CB342; border-radius: 2px;"></div>
      <p style="margin: 12px 0 0; font-size: 11px; font-weight: 700; color: #7CB342; letter-spacing: 2.2px; text-transform: uppercase;">Laundry Day NYC</p>
    </div>
    ${inner}
    ${SIGNATURE_HTML}
  </div>
</div>`;
}

function reAttemptButton(href, dayLabel) {
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 24px auto;">
  <tr><td align="center" style="border-radius: 12px; background: #7CB342;">
    <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 36px; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px;">
      Yes, Come Back ${dayLabel}
    </a>
  </td></tr>
</table>`;
}

// Build access-unavailable email — driver couldn't get inside the building
function buildAccessEmail({ time, area, day, isFirstDay, day2, tenantEmail }) {
  const subject = "We tried to pick up your laundry today";
  const reattemptLink = `${BASE_URL}/api/confirm-reattempt?area=${area}&day=${day2}&email=${encodeURIComponent(tenantEmail || "")}`;
  const reAttempt = isFirstDay
    ? `
<p style="text-align: center; font-size: 15px; color: #1a1a1a; margin: 24px 0 8px;">
  No problem &mdash; we'll be back <strong>${day2}</strong>. Want us to try again then?
</p>
${reAttemptButton(reattemptLink, day2)}`
    : "";
  const html = shellHtml(`
    <div style="text-align: center; padding: 14px 0 0;">
      <h1 style="margin: 14px 0 10px; font-size: 24px; font-weight: 700; color: #1a1a1a;">We couldn't get into your building</h1>
      <p style="margin: 0; font-size: 15px; color: #666; line-height: 1.55;">
        Our driver stopped by at <strong>${time}</strong> today to collect your laundry, but couldn't access your building. We buzzed your unit and a few neighbors but couldn't get in.
      </p>
    </div>
    ${reAttempt}`);
  const text = `Hi! Our driver stopped by at ${time} today to collect your laundry, but couldn't access your building. We buzzed your unit and a few neighbors but couldn't get in.\n\n${
    isFirstDay
      ? `No problem — we'll be back ${day2}. Click to confirm: ${reattemptLink}`
      : ""
  }`;
  return { subject, html, text };
}

// Build bag-not-out email — driver got in but didn't see a bag at the door
function buildNoBagEmail({ time, area, day, isFirstDay, day2, unit, tenantEmail }) {
  const subject = "We didn't see your bag today";
  const reattemptLink = `${BASE_URL}/api/confirm-reattempt?area=${area}&day=${day2}&email=${encodeURIComponent(tenantEmail || "")}`;
  const reAttempt = isFirstDay
    ? `
<p style="text-align: center; font-size: 15px; color: #1a1a1a; margin: 24px 0 8px;">
  If you'd still like a pickup this week, we'll be back <strong>${day2}</strong>.
</p>
${reAttemptButton(reattemptLink, day2)}`
    : "";
  const html = shellHtml(`
    <div style="text-align: center; padding: 14px 0 0;">
      <h1 style="margin: 14px 0 10px; font-size: 24px; font-weight: 700; color: #1a1a1a;">We didn't see your bag</h1>
      <p style="margin: 0; font-size: 15px; color: #666; line-height: 1.55;">
        Our driver got into your building at <strong>${time}</strong> today to collect your laundry, but didn't see a bag outside ${
          unit ? `Unit <strong>${unit}</strong>` : "your apartment door"
        }.
      </p>
    </div>
    ${reAttempt}`);
  const text = `Hi! Our driver got into your building at ${time} today to collect your laundry, but didn't see a bag outside ${
    unit ? `Unit ${unit}` : "your apartment door"
  }.\n\n${
    isFirstDay
      ? `If you'd still like a pickup this week, leave the bag out by 10 AM ${day2}. Click to confirm: ${reattemptLink}`
      : ""
  }`;
  return { subject, html, text };
}

// Build drop-off "can't access building" email — driver couldn't get inside to RETURN laundry.
// No re-attempt link: the laundry is already washed and in our possession, so we ask the
// customer to reach out rather than auto-scheduling a redelivery.
function buildDropoffAccessEmail({ time }) {
  const subject = "We tried to return your laundry today";
  const html = shellHtml(`
    <div style="text-align: center; padding: 14px 0 0;">
      <h1 style="margin: 14px 0 10px; font-size: 24px; font-weight: 700; color: #1a1a1a;">We couldn't get into your building</h1>
      <p style="margin: 0; font-size: 15px; color: #666; line-height: 1.55;">
        Our driver came by at <strong>${time}</strong> today to return your freshly cleaned laundry, but couldn't get into your building. We buzzed your unit and a few neighbors but couldn't get in.
      </p>
      <p style="margin: 16px 0 0; font-size: 15px; color: #666; line-height: 1.55;">
        Not to worry &mdash; your laundry is safe with us. Our driver will try again on the next pick up / drop off day.
      </p>
    </div>`);
  const text = `Hi! Our driver came by at ${time} today to return your freshly cleaned laundry, but couldn't get into your building. We buzzed your unit and a few neighbors but couldn't get in.\n\nNot to worry — your laundry is safe with us. Our driver will try again on the next pick up / drop off day.`;
  return { subject, html, text };
}

// Build drop-off "couldn't complete delivery" email — driver reached the door but
// couldn't hand off / safely leave the clean laundry.
function buildDeliveryFailedEmail({ time, unit }) {
  const subject = "We couldn't complete your laundry delivery today";
  const html = shellHtml(`
    <div style="text-align: center; padding: 14px 0 0;">
      <h1 style="margin: 14px 0 10px; font-size: 24px; font-weight: 700; color: #1a1a1a;">We couldn't complete your delivery</h1>
      <p style="margin: 0; font-size: 15px; color: #666; line-height: 1.55;">
        Our driver reached your building at <strong>${time}</strong> today to return your freshly cleaned laundry${
          unit ? ` (Unit <strong>${unit}</strong>)` : ""
        }, but couldn't complete the delivery.
      </p>
      <p style="margin: 16px 0 0; font-size: 15px; color: #666; line-height: 1.55;">
        Not to worry &mdash; your laundry is safe with us. Our driver will try again on the next pick up / drop off day.
      </p>
    </div>`);
  const text = `Hi! Our driver reached your building at ${time} today to return your freshly cleaned laundry${
    unit ? ` (Unit ${unit})` : ""
  }, but couldn't complete the delivery.\n\nNot to worry — your laundry is safe with us. Our driver will try again on the next pick up / drop off day.`;
  return { subject, html, text };
}

// Pick the correct tenant email for an issue based on pick-up vs drop-off context.
// Drop-offs never carry the re-attempt link (see builders above).
function buildIssueEmail({ mode, type, time, area, day, isFirstDay, day2, unit, tenantEmail }) {
  if (mode === "dropoff") {
    return type === "access_unavailable"
      ? buildDropoffAccessEmail({ time })
      : buildDeliveryFailedEmail({ time, unit });
  }
  return type === "access_unavailable"
    ? buildAccessEmail({ time, area, day, isFirstDay, day2, tenantEmail })
    : buildNoBagEmail({ time, area, day, isFirstDay, day2, unit, tenantEmail });
}

// Human label for the admin/test-mode banner.
function issueTypeLabel(type) {
  return type === "access_unavailable"
    ? "Can't access building"
    : type === "delivery_failed"
    ? "Couldn't complete delivery"
    : "Bag not at door";
}

// POST /api/driver/issue — multipart form
//   fields: pin, day, address, unit, mode ("pickup" | "dropoff"),
//           type — pickup: "access_unavailable" | "no_bag";
//                  dropoff: "access_unavailable" | "delivery_failed"
//   file:   photo
export async function POST(request) {
  const form = await request.formData();
  const pin = form.get("pin");
  const day = form.get("day");
  const address = form.get("address");
  const unit = form.get("unit") || "";
  const type = form.get("type");
  const mode = (form.get("mode") || "pickup").toLowerCase();
  const photoFile = form.get("photo");

  const area = getAreaForPin(pin);
  if (!area) return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  if (!day || !address || !type) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!photoFile || typeof photoFile.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Photo required" }, { status: 400 });
  }

  const config = AREA_CONFIG[area];
  // For dropoff-day routes (uptown Mon, downtown Fri), file under the original
  // pickup week — see resolveWeekForDriverDay() in lib/sheets.
  const week = resolveWeekForDriverDay(area, day);
  const isFirstDay = day.toLowerCase() === config.day1.toLowerCase();

  // Test mode: skip photo upload + sheet writes, still send the redirected
  // admin email so a real-looking notification lands in laundrydaynyc@gmail.com.
  const testMode = (await getSetting("test_mode_enabled", "false")) === "true";
  if (testMode) {
    try {
      const customer = await findCustomerByAddress(area, address, unit);
      const tenantEmail = customer?.emails?.[0] || "";
      const adminEmail = process.env.GMAIL_USER || "laundrydaynyc@gmail.com";
      if (tenantEmail) {
        const timeStr = formatET(new Date());
        const built = buildIssueEmail({
          mode, type, time: timeStr, area, day, isFirstDay, day2: config.day2, unit, tenantEmail,
        });
        const testBanner = `
<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 10px; padding: 14px 18px; margin: 0 0 18px; font-family: Arial, sans-serif;">
  <p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #856404;">🧪 TEST MODE — Nothing was saved</p>
  <p style="margin: 0; font-size: 13px; color: #856404; line-height: 1.4;">
    Driver tapped the issue button while test mode is ON. No sheet rows, no photos uploaded.<br>
    <strong>Would-be recipient:</strong> ${tenantEmail}<br>
    <strong>Address:</strong> ${address}${unit ? `, Unit ${unit}` : ""}<br>
    <strong>Issue type:</strong> ${issueTypeLabel(type)}
  </p>
</div>`;
        await sendEmail({
          to: adminEmail,
          subject: `[TEST MODE] ${built.subject} (→ ${tenantEmail})`,
          text: `[TEST MODE — nothing saved]\nIssue: ${type}\nAddress: ${address}${unit ? `, Unit ${unit}` : ""}\nWould-be recipient: ${tenantEmail}\n\n---\n\n${built.text}`,
          html: testBanner + built.html,
        });
      }
    } catch (e) {
      console.warn("Test-mode issue email failed:", e.message);
    }
    return NextResponse.json({
      ok: true,
      testMode: true,
      photoUrl: "https://placehold.co/600x400?text=Test+Mode+(photo+discarded)",
      emailSent: true,
      emailMode: "test_redirected",
    });
  }

  try {
    // 1. Upload photo to Drive
    const buffer = Buffer.from(await photoFile.arrayBuffer());
    const safeAddr = String(address).replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
    const safeUnit = String(unit).replace(/[^a-zA-Z0-9]+/g, "-") || "noUnit";
    const ts = Date.now();
    const filename = `${safeAddr}__${safeUnit}__${type}__${ts}.jpg`;
    const subfolder = `Pickup Issues/${week}/${day}`;
    const photo = await uploadPhoto({
      buffer,
      mimeType: photoFile.type || "image/jpeg",
      filename,
      subfolder,
    });

    // 2. Find the tenant
    const customer = await findCustomerByAddress(area, address, unit);
    const tenantEmail = customer?.emails?.[0] || "";

    // 3. Log the issue
    await logDriverIssue({
      area,
      weekId: week,
      day,
      issueType: type,
      address,
      unit,
      tenantEmail,
      photoUrl: photo.viewUrl,
    });

    // 4. Update driver progress (SAFE merge — re-reads latest before write)
    const key = `${String(address).toLowerCase().trim()}|${String(unit).trim()}`;
    await mergeDriverProgress(area, week, day, {
      [key]: { status: type, time: new Date().toISOString() },
    });

    // 5. Send tenant email — or redirect to admin if test mode is on
    const driverEmailsEnabled =
      (await getSetting("driver_emails_enabled", "false")) === "true";
    const adminEmail = process.env.GMAIL_USER || "laundrydaynyc@gmail.com";

    let emailSent = false;
    let emailMode = "none";
    if (tenantEmail) {
      try {
        const timeStr = formatET(new Date());
        const built = buildIssueEmail({
          mode, type, time: timeStr, area, day, isFirstDay, day2: config.day2, unit, tenantEmail,
        });

        if (driverEmailsEnabled) {
          await sendEmail({
            to: tenantEmail,
            subject: built.subject,
            text: built.text,
            html: built.html,
          });
          emailMode = "live";
        } else {
          const testBanner = `
<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 10px; padding: 14px 18px; margin: 0 0 18px; font-family: Arial, sans-serif;">
  <p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #856404;">🧪 TEST MODE — Driver emails are OFF</p>
  <p style="margin: 0; font-size: 13px; color: #856404; line-height: 1.4;">
    This is the email that <strong>WOULD HAVE</strong> been sent to the tenant.<br>
    <strong>Intended recipient:</strong> ${tenantEmail}<br>
    <strong>Address:</strong> ${address}${unit ? `, Unit ${unit}` : ""}<br>
    <strong>Issue type:</strong> ${issueTypeLabel(type)}
  </p>
</div>`;
          const wrappedHtml = testBanner + built.html;
          const wrappedText = `[TEST MODE — would have gone to ${tenantEmail}]\nIssue: ${type}\nAddress: ${address}${unit ? `, Unit ${unit}` : ""}\n\n---\n\n${built.text}`;
          await sendEmail({
            to: adminEmail,
            subject: `[TEST] ${built.subject} (→ ${tenantEmail})`,
            text: wrappedText,
            html: wrappedHtml,
          });
          emailMode = "test_redirected";
        }
        emailSent = true;
      } catch (e) {
        console.warn("Issue email failed:", e.message);
      }
    }

    return NextResponse.json({
      ok: true,
      photoUrl: photo.viewUrl,
      tenantEmail: tenantEmail || null,
      emailSent,
      emailMode,
    });
  } catch (err) {
    console.error("Driver issue error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
