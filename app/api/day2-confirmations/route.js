import { NextResponse } from "next/server";
import { getCustomers, getPickupResponses, getCurrentWeekId, AREA_CONFIG } from "../../../lib/sheets";

// GET /api/day2-confirmations?area=uptown&pin=1234
// Returns emails of customers who confirmed for day2 (Saturday/Thursday)
// so you can send them a morning-of reminder
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  const week = searchParams.get("week") || getCurrentWeekId();
  const pin = searchParams.get("pin");

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = AREA_CONFIG[area];
  if (!config) {
    return NextResponse.json({ error: "Invalid area: " + area }, { status: 400 });
  }

  try {
    const [customers, responses] = await Promise.all([
      getCustomers(area),
      getPickupResponses(area, week),
    ]);

    // Find responses where the confirmed day is day2 (case-insensitive,
    // consistent with the other routes)
    const day2Emails = new Set(
      responses
        .filter((r) => r[3]?.toLowerCase() === config.day2.toLowerCase())
        .map((r) => r[2]?.toLowerCase())
        .filter(Boolean)
    );

    // Match back to customer records to get full email strings
    const confirmed = customers.filter((c) =>
      c.emails.some((e) => day2Emails.has(e.toLowerCase()))
    );

    const emails = confirmed.flatMap((c) => c.emails);

    return NextResponse.json({
      emails,
      emailString: emails.join(", "),
      totalConfirmed: confirmed.length,
      day: config.day2,
      config,
    });
  } catch (err) {
    console.error("Day2 confirmations error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
