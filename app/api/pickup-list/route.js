import { NextResponse } from "next/server";
import { getCustomers, getKeys, getPickupResponses, getCurrentWeekId, buildPickupList, buildCombinedList, AREA_CONFIG } from "../../../lib/sheets";

// GET /api/pickup-list?area=uptown&day=Friday&week=2026-W13
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  const day = searchParams.get("day");
  const week = searchParams.get("week") || getCurrentWeekId();

  const pin = searchParams.get("pin");
  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!day) {
    return NextResponse.json({ error: "Missing day parameter" }, { status: 400 });
  }

  try {
    const config = AREA_CONFIG[area];
    const [customers, keysMap, responses] = await Promise.all([
      getCustomers(area),
      getKeys(),
      getPickupResponses(area, week),
    ]);

    // Is this day2 (Saturday or Thursday)? If so, build a combined list
    const isDay2 = day.toLowerCase() === config.day2.toLowerCase();

    if (isDay2) {
      // Day2 = combined list: day1 drop-offs + day2 pickups
      const day1ConfirmedEmails = responses
        .filter((r) => r[3]?.toLowerCase() === config.day1.toLowerCase())
        .map((r) => r[2]?.toLowerCase());

      const day2ConfirmedEmails = responses
        .filter((r) => r[3]?.toLowerCase() === config.day2.toLowerCase())
        .map((r) => r[2]?.toLowerCase());

      const day1Customers = customers.filter((c) =>
        c.emails.some((e) => day1ConfirmedEmails.includes(e.toLowerCase()))
      );

      const day2Customers = customers.filter((c) =>
        c.emails.some((e) => day2ConfirmedEmails.includes(e.toLowerCase()))
      );

      const pickupList = buildCombinedList(day1Customers, day2Customers, keysMap, area);

      return NextResponse.json({
        pickupList,
        day,
        area,
        week,
        isCombined: true,
        day1: config.day1,
        totalDropoffs: day1Customers.length,
        totalPickups: day2Customers.length,
        totalConfirmed: pickupList.length,
        config,
      });
    } else {
      // Day1 = simple pickup list
      const confirmedEmails = responses
        .filter((r) => r[3]?.toLowerCase() === day.toLowerCase())
        .map((r) => r[2]?.toLowerCase());

      const confirmedCustomers = customers.filter((c) =>
        c.emails.some((e) => confirmedEmails.includes(e.toLowerCase()))
      );

      const pickupList = buildPickupList(confirmedCustomers, keysMap, area, "pickup");

      return NextResponse.json({
        pickupList,
        day,
        area,
        week,
        isCombined: false,
        totalConfirmed: pickupList.length,
        config,
      });
    }
  } catch (err) {
    console.error("Pickup list error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
