import { NextResponse } from "next/server";
import { getCustomers, getKeys, getPickupResponses, getCurrentWeekId, buildPickupList, AREA_CONFIG } from "../../../lib/sheets";

// GET /api/pickup-list?area=uptown&day=friday&week=2026-W13&pin=1234
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  const day = searchParams.get("day");
  const week = searchParams.get("week") || getCurrentWeekId();
  // PIN auth temporarily disabled
  // const pin = searchParams.get("pin");
  // if (pin !== process.env.ADMIN_PIN) {
  //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // }

  if (!day) {
    return NextResponse.json({ error: "Missing day parameter" }, { status: 400 });
  }

  try {
    const [customers, keysMap, responses] = await Promise.all([
      getCustomers(area),
      getKeys(),
      getPickupResponses(area, week),
    ]);

    // Find customers who confirmed for this specific day
    const confirmedEmails = responses
      .filter((r) => r[3]?.toLowerCase() === day.toLowerCase())
      .map((r) => r[2]?.toLowerCase());

    const confirmedCustomers = customers.filter((c) =>
      c.emails.some((e) => confirmedEmails.includes(e.toLowerCase()))
    );

    const pickupList = buildPickupList(confirmedCustomers, keysMap);
    const config = AREA_CONFIG[area];

    return NextResponse.json({
      pickupList,
      day,
      area,
      week,
      totalConfirmed: pickupList.length,
      config,
    });
  } catch (err) {
    console.error("Pickup list error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
