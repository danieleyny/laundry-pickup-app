import { NextResponse } from "next/server";
import {
  getCustomers,
  getCurrentWeekId,
  logPickupConfirmation,
  updatePickupConfirmationDay,
} from "../../../lib/sheets";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// GET /api/confirm-reattempt?area=X&day=Y&email=Z
// True one-click: confirms the tenant for the given day, then redirects to a thank-you page.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area");
  const day = searchParams.get("day");
  const email = (searchParams.get("email") || "").toLowerCase().trim();

  if (!area || !day || !email) {
    const url = new URL("/confirm-reattempt", request.url);
    url.searchParams.set("status", "error");
    return NextResponse.redirect(url);
  }

  try {
    const week = getCurrentWeekId();
    // Look up the customer for personalization
    const customers = await getCustomers(area);
    const customer = customers.find((c) =>
      c.emails.some((e) => e.toLowerCase() === email)
    );
    if (!customer) {
      const url = new URL("/confirm-reattempt", request.url);
      url.searchParams.set("status", "not_found");
      return NextResponse.redirect(url);
    }

    // Try to log; if they already confirmed, update existing record to new day
    const logResult = await logPickupConfirmation(
      area,
      week,
      email,
      day,
      customer.name
    );
    if (logResult.status === "already_confirmed_different_day") {
      await updatePickupConfirmationDay(area, week, email, day);
    }

    const url = new URL("/confirm-reattempt", request.url);
    url.searchParams.set("status", "ok");
    url.searchParams.set("day", day);
    url.searchParams.set("name", customer.name.split(",")[0].trim());
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("Reattempt confirm error:", err);
    const url = new URL("/confirm-reattempt", request.url);
    url.searchParams.set("status", "error");
    return NextResponse.redirect(url);
  }
}
