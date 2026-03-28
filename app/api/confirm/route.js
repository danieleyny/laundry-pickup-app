import { NextResponse } from "next/server";
import { logPickupConfirmation, getCurrentWeekId, getCustomers } from "../../../lib/sheets";

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

    // If email not found in customer list, redirect to not_found page
    if (!customer) {
      const notFoundUrl = new URL("/confirm", request.url);
      notFoundUrl.searchParams.set("status", "not_found");
      notFoundUrl.searchParams.set("email", email);
      return NextResponse.redirect(notFoundUrl);
    }

    const customerName = customer.name;

    const result = await logPickupConfirmation(
      area,
      week,
      email.toLowerCase(),
      day,
      customerName
    );

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
