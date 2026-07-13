import { NextResponse } from "next/server";
import {
  getCustomers,
  getKeys,
  getPickupResponses,
  getCurrentWeekId,
  resolveWeekForDriverDay,
  buildPickupList,
  buildCombinedList,
  getRouteEdits,
  applyRouteEdits,
  getRouteOrder,
  applyRouteOrder,
  getDriverProgress,
  AREA_CONFIG,
} from "../../../../lib/sheets";
import { getAreaForPin } from "../../../../lib/driver-auth";
import { sortByRoute } from "../../../../lib/route-geo";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// GET /api/driver/route?pin=1234&day=Tuesday
// Returns the route (in driver order) plus per-stop status from Driver Progress.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  const dayParam = searchParams.get("day");

  const area = getAreaForPin(pin);
  if (!area) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const config = AREA_CONFIG[area];
  // Default day = today (in ET) if it falls on a pickup OR dropoff day for this area, else day1
  const day = dayParam || resolveTodayForArea(area, config);
  // dropoffDay routes read from the previous ISO week (or same week for downtown)
  // — see resolveWeekForDriverDay() for the rule. Standard days use current week.
  const week = resolveWeekForDriverDay(area, day);

  const isDay2 = day.toLowerCase() === config.day2.toLowerCase();
  const isDropoffOnly = !!config.dropoffDay && day.toLowerCase() === config.dropoffDay.toLowerCase();

  try {
    const [customers, keysMap, responses, edits, savedOrder, progress] =
      await Promise.all([
        getCustomers(area),
        getKeys(),
        getPickupResponses(area, week),
        getRouteEdits(area, week, day),
        getRouteOrder(area, week, day),
        getDriverProgress(area, week, day),
      ]);

    let pickupList;
    if (isDropoffOnly) {
      // Pure dropoff: deliver what was picked up on the previous day2.
      // No new pickups, no permanent-cycle stops, no auto walk-up customers —
      // those are all pickup-day-only concepts. Build the list directly
      // (bypass buildPickupList) so addUptownAutos doesn't add walk-up
      // pickups, and append953Dropoff doesn't inject 953 Columbus when
      // they may not have actually had a Saturday pickup.
      const day2Confirmed = responses
        .filter((r) => r[3]?.toLowerCase() === config.day2.toLowerCase())
        .map((r) => r[2]?.toLowerCase());
      const day2Customers = customers.filter((c) =>
        c.emails.some((e) => day2Confirmed.includes(e.toLowerCase()))
      );
      pickupList = day2Customers.map((c) => ({
        address: c.address,
        unit: c.unit,
        name: c.name,
        phone: c.phone,
        type: "dropoff",
        entryMethod: (() => {
          const k = c.address.toLowerCase().replace(/\s+/g, " ").trim();
          const info = keysMap[k] || {};
          if (info.keyInfo && info.entryType) return `${info.entryType} - ${info.keyInfo}`;
          return info.keyInfo || info.entryType || "See notes";
        })(),
      }));
      sortByRoute(pickupList, area);
    } else if (isDay2) {
      const day1Confirmed = responses
        .filter((r) => r[3]?.toLowerCase() === config.day1.toLowerCase())
        .map((r) => r[2]?.toLowerCase());
      const day2Confirmed = responses
        .filter((r) => r[3]?.toLowerCase() === config.day2.toLowerCase())
        .map((r) => r[2]?.toLowerCase());
      const day1Customers = customers.filter((c) =>
        c.emails.some((e) => day1Confirmed.includes(e.toLowerCase()))
      );
      const day2Customers = customers.filter((c) =>
        c.emails.some((e) => day2Confirmed.includes(e.toLowerCase()))
      );
      pickupList = buildCombinedList(day1Customers, day2Customers, keysMap, area, day);
    } else {
      const confirmedEmails = responses
        .filter((r) => r[3]?.toLowerCase() === day.toLowerCase())
        .map((r) => r[2]?.toLowerCase());
      const confirmedCustomers = customers.filter((c) =>
        c.emails.some((e) => confirmedEmails.includes(e.toLowerCase()))
      );
      pickupList = buildPickupList(confirmedCustomers, keysMap, area, "pickup", day);
    }

    pickupList = applyRouteEdits(pickupList, edits, area);
    pickupList = applyRouteOrder(pickupList, savedOrder, area);

    // Attach per-stop status from progress object (keyed by "address|unit")
    const keyOf = (s) =>
      `${(s.address || "").toLowerCase().trim()}|${(s.unit || "").trim()}`;
    const enriched = pickupList.map((s) => ({
      ...s,
      key: keyOf(s),
      status: progress[keyOf(s)]?.status || "pending",
      statusTime: progress[keyOf(s)]?.time || null,
    }));

    return NextResponse.json({
      area,
      day,
      week,
      config,
      isCombined: isDay2,
      isDropoffOnly,
      stops: enriched,
    });
  } catch (err) {
    console.error("Driver route error:", err);
    const msg = String(err?.message || "");
    if (msg.toLowerCase().includes("quota") || err?.code === 429) {
      // Even after the in-library retry budget. Tell the driver to wait a
      // few seconds and reload instead of dumping the raw Google error.
      return NextResponse.json(
        { error: "Spreadsheet is busy — wait 10 seconds and reload." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function resolveTodayForArea(area, config) {
  // Convert UTC to ET to get the actual day name in NY
  const now = new Date();
  const etStr = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
  });
  const et = new Date(etStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayName = days[et.getDay()];
  const todayLc = todayName.toLowerCase();

  if (todayLc === config.day1.toLowerCase()) return config.day1;
  if (todayLc === config.day2.toLowerCase()) return config.day2;
  // Pure dropoff day for the previous day2's pickups — surfaces the right
  // dropoff list when the driver logs in on Monday (uptown) / Friday (downtown).
  if (config.dropoffDay && todayLc === config.dropoffDay.toLowerCase()) return config.dropoffDay;
  // Default to day1 if it's not a pickup or dropoff day (lets driver pre-view the route)
  return config.day1;
}
