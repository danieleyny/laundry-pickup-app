import { NextResponse } from "next/server";
import { getCustomers, getKeys, getPickupResponses, getCurrentWeekId, buildPickupList, AREA_CONFIG } from "../../../lib/sheets";

// ─────────────────────────────────────────────────────────────────────────────
// Automatic entries that appear on EVERY Friday and Saturday list, regardless
// of whether any tenant confirmed.  Both buildings are serviced weekly.
//
// TODO: Replace the placeholder addresses below with the real building addresses.
//       Type is "Walk Up" and note is "Has Keys" for both.
// ─────────────────────────────────────────────────────────────────────────────
const FRIDAY_SATURDAY_AUTO_BUILDINGS = [
  {
    // TODO: Replace with the actual first recurring building address
    address: "TODO: RECURRING_BUILDING_1_ADDRESS",
    unit: "",
    name: "Recurring Building",
    entryMethod: "Walk Up - Has Keys",
  },
  {
    // TODO: Replace with the actual second recurring building address
    address: "TODO: RECURRING_BUILDING_2_ADDRESS",
    unit: "",
    name: "Recurring Building",
    entryMethod: "Walk Up - Has Keys",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// The last entry on every Friday and Saturday list is always a dropoff at
// 953 Columbus Ave, no matter what other entries are on the list.
// ─────────────────────────────────────────────────────────────────────────────
const FRIDAY_SATURDAY_FINAL_DROPOFF = {
  address: "953 Columbus Ave",
  unit: "",
  name: "",
  entryMethod: "Dropoff",
};

// GET /api/pickup-list?area=uptown&day=friday&week=2026-W13&pin=1234
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

    // Build the geographically-sorted list of confirmed pickups
    let pickupList = buildPickupList(confirmedCustomers, keysMap);

    // For Friday and Saturday: prepend automatic recurring buildings and
    // append the fixed final dropoff at 953 Columbus Ave.
    const isFriOrSat =
      day.toLowerCase() === "friday" || day.toLowerCase() === "saturday";

    if (isFriOrSat) {
      pickupList = [
        ...FRIDAY_SATURDAY_AUTO_BUILDINGS,
        ...pickupList,
        FRIDAY_SATURDAY_FINAL_DROPOFF,
      ];
    }

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
