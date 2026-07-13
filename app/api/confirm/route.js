import { NextResponse } from "next/server";
import {
  logPickupConfirmation,
  updatePickupConfirmationDay,
  getCurrentWeekId,
  getCustomers,
  getKeys,
  saveRouteAddWithMirror,
  AREA_CONFIG,
} from "../../../lib/sheets";
import { sendEmail } from "../../../lib/email";
import { verifyToken } from "../../../lib/confirm-token";

// Look up the building's entry method from the Keys sheet, mirroring buildEntry's logic.
function entryMethodFor(address, keysMap) {
  const k = (address || "").toLowerCase().replace(/\s+/g, " ").trim();
  const info = keysMap[k] || {};
  if (info.keyInfo && info.entryType) return `${info.entryType} - ${info.keyInfo}`;
  if (info.keyInfo) return info.keyInfo;
  if (info.entryType) return info.entryType;
  return "See notes";
}

// Late confirmation → add an explicit route edit so the stop appears on the
// driver's route even if the route was already loaded for the day, and so the
// late-add is visibly tagged in the Route Edits sheet. If it's day1, the
// helper also creates a day2 dropoff mirror so the laundry gets returned.
async function recordLateSignupAsRouteEdit(area, day, customer) {
  try {
    const week = getCurrentWeekId();
    const keysMap = await getKeys();
    const entryMethod = entryMethodFor(customer.address, keysMap);
    await saveRouteAddWithMirror(
      area, week, day, customer.address, customer.unit || "",
      entryMethod, "pickup", "late-signup",
    );
  } catch (err) {
    console.error("Late-signup route edit failed:", err);
  }
}

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// Check if right now is after 10am ET on the confirmed pickup day
function isLateConfirmation(day) {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayName = dayNames[et.getDay()];
  if (todayName.toLowerCase() !== day.toLowerCase()) return false;
  return et.getHours() >= 10;
}

async function sendLateAlert(email, address, unit, day) {
  const alertEmail = process.env.ALERT_EMAIL || process.env.GMAIL_USER || "laundrydaynyc@gmail.com";
  const fullAddress = unit ? `${address}, ${unit}` : address;
  await sendEmail({
    to: alertEmail,
    subject: `Late Pickup Signup - ${day}`,
    text: `A customer signed up for pickup after 10am today (${day}).\n\nEmail: ${email}\nAddress: ${fullAddress}\n\nThis pickup was confirmed after the 10am cutoff.`,
  });
}

// GET /api/confirm?email=x&day=friday&area=uptown&week=2026-W13&change=true
//   ── OR Phase 2 one-tap form ──
//   /api/confirm?e=<email>&day=<Day>&area=<area>&w=<week>&t=<HMAC>
//
// When a valid `t` token is present, we trust the identity (the email was
// signed into the link at send time) and skip the type-email page. If `t`
// is missing or invalid, we fall back to the legacy ?email=... flow, which
// keeps forwarded-email safety + backward compatibility intact.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const longEmail = searchParams.get("email");
  const shortEmail = searchParams.get("e");
  const day = searchParams.get("day");
  const area = searchParams.get("area");
  const week = searchParams.get("week") || searchParams.get("w") || getCurrentWeekId();
  const change = searchParams.get("change") === "true";
  const token = searchParams.get("t");

  // Prefer the signed `e` if a valid token verifies it; otherwise fall back.
  let email = longEmail;
  if (shortEmail && day && area && week && token) {
    if (verifyToken({ email: shortEmail, day, area, week }, token)) {
      email = shortEmail;
    } else {
      // Tampered or expired link — redirect to type-email fallback page
      // so the user can still confirm by entering their address.
      const fallback = new URL("/pickup", request.url);
      fallback.searchParams.set("area", area);
      if (day) fallback.searchParams.set("day", day);
      return NextResponse.redirect(fallback);
    }
  }

  if (!email || !day || !area) {
    return NextResponse.json(
      { error: "Missing required parameters: email, day, area" },
      { status: 400 }
    );
  }

  try {
    // Look up customer name from the sheet
    const customers = await getCustomers(area);
    const customer = customers.find((c) =>
      c.emails.some((e) => e.toLowerCase() === email.toLowerCase())
    );

    // If email not found in customer list, redirect to not_found page
    if (!customer) {
      const notFoundUrl = new URL("/confirm", request.url);
      notFoundUrl.searchParams.set("status", "not_found");
      notFoundUrl.searchParams.set("email", email);
      notFoundUrl.searchParams.set("area", area);
      return NextResponse.redirect(notFoundUrl);
    }

    const customerName = customer.name;
    const firstName = customerName.split(",")[0].trim();

    // If this is a change request (from the "change day" flow), update directly
    if (change) {
      const updateResult = await updatePickupConfirmationDay(
        area,
        week,
        email.toLowerCase(),
        day
      );

      if (updateResult.status === "changed" && isLateConfirmation(day)) {
        sendLateAlert(email, customer.address, customer.unit, day).catch((err) =>
          console.error("Failed to send late alert email:", err)
        );
        recordLateSignupAsRouteEdit(area, day, customer);
      }

      const confirmUrl = new URL("/confirm", request.url);
      confirmUrl.searchParams.set("status", "changed");
      confirmUrl.searchParams.set("day", day);
      confirmUrl.searchParams.set("previousDay", updateResult.previousDay || "");
      confirmUrl.searchParams.set("name", firstName);
      return NextResponse.redirect(confirmUrl);
    }

    const result = await logPickupConfirmation(
      area,
      week,
      email.toLowerCase(),
      day,
      customerName
    );

    // Send late confirmation alert if after 10am on the pickup day, and
    // also explicitly add the address to the route via a route edit so the
    // driver sees it on a refresh + (for day1) auto-create the day2 dropoff.
    if (result.status === "confirmed" && isLateConfirmation(day)) {
      sendLateAlert(email, customer.address, customer.unit, day).catch((err) =>
        console.error("Failed to send late alert email:", err)
      );
      recordLateSignupAsRouteEdit(area, day, customer);
    }

    // If already confirmed for a DIFFERENT day, redirect to the change-day prompt
    if (result.status === "already_confirmed_different_day") {
      const confirmUrl = new URL("/confirm", request.url);
      confirmUrl.searchParams.set("status", "change_prompt");
      confirmUrl.searchParams.set("existingDay", result.existingDay);
      confirmUrl.searchParams.set("newDay", day);
      confirmUrl.searchParams.set("email", email);
      confirmUrl.searchParams.set("area", area);
      confirmUrl.searchParams.set("name", firstName);
      return NextResponse.redirect(confirmUrl);
    }

    // already_confirmed_same_day — fall through to the existing already_confirmed UI
    const legacyStatus =
      result.status === "already_confirmed_same_day" ? "already_confirmed" : result.status;

    // Redirect to confirmation page
    const confirmUrl = new URL("/confirm", request.url);
    confirmUrl.searchParams.set("status", legacyStatus);
    confirmUrl.searchParams.set("day", day);
    confirmUrl.searchParams.set("name", firstName);

    return NextResponse.redirect(confirmUrl);
  } catch (err) {
    console.error("Confirm error:", err);
    const errorUrl = new URL("/confirm", request.url);
    errorUrl.searchParams.set("status", "error");
    return NextResponse.redirect(errorUrl);
  }
}
