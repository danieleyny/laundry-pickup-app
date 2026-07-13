import { NextResponse } from "next/server";
import { getCustomers, getPickupResponses, getCurrentWeekId, AREA_CONFIG } from "../../../lib/sheets";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// GET /api/remaining-emails?area=uptown&week=2026-W13&pin=1234
// Returns all customer emails who have NOT confirmed for ANY day this week
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  const week = searchParams.get("week") || getCurrentWeekId();
  const pin = searchParams.get("pin");
  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [customers, responses] = await Promise.all([
      getCustomers(area),
      getPickupResponses(area, week),
    ]);

    // All emails that have confirmed for any day this week
    const confirmedEmails = new Set(
      responses.map((r) => r[2]?.toLowerCase()).filter(Boolean)
    );

    // Customers where NONE of their emails have confirmed
    const remaining = customers.filter(
      (c) => !c.emails.some((e) => confirmedEmails.has(e.toLowerCase()))
    );

    // Flatten all remaining emails
    const remainingEmails = remaining.flatMap((c) => c.emails);

    const config = AREA_CONFIG[area];

    return NextResponse.json({
      remainingEmails,
      emailString: remainingEmails.join(", "),
      totalRemaining: remaining.length,
      totalConfirmed: confirmedEmails.size,
      totalCustomers: customers.length,
      config,
    });
  } catch (err) {
    console.error("Remaining emails error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
