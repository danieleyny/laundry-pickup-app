import { NextResponse } from "next/server";
import { logPickupConfirmation, getCurrentWeekId, getCustomers } from "../../../lib/sheets";
import { isLateSignup, sendLateSignupNotification } from "../../../lib/email";

// GET /api/confirm?email=x&day=friday&area=uptown&week=2026-W13
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const day = searchParams.get("day");
  const area = searchParams.get("area");
  const week = searchParams.get("week") || getCurrentWeekId();

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
    const customerName = customer?.name || "Unknown";

    const result = await logPickupConfirmation(
      area,
      week,
      email.toLowerCase(),
      day,
      customerName
    );

    // If this is a brand-new confirmation and it's past 10:00 AM ET, notify admin
    if (result.status === "confirmed" && isLateSignup()) {
      sendLateSignupNotification({
        customerName,
        email,
        day,
        area,
        timestamp: new Date().toISOString(),
      }).catch((err) => console.error("[Late Signup] Notification failed:", err));
    }

    // Redirect to confirmation page
    const confirmUrl = new URL("/confirm", request.url);
    confirmUrl.searchParams.set("status", result.status);
    confirmUrl.searchParams.set("day", day);
    confirmUrl.searchParams.set("name", customerName.split(",")[0].trim());

    return NextResponse.redirect(confirmUrl);
  } catch (err) {
    console.error("Confirm error:", err);
    const errorUrl = new URL("/confirm", request.url);
    errorUrl.searchParams.set("status", "error");
    return NextResponse.redirect(errorUrl);
  }
}
