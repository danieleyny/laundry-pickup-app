import { NextResponse } from "next/server";
import { saveRouteAddWithMirror, getCurrentWeekId } from "../../../../lib/sheets";
import { getAreaForPin } from "../../../../lib/driver-auth";

// POST /api/driver/add-stop
// Body: { pin, day, address, unit, entryMethod, type }
// Drivers can ONLY add (not remove). Source is recorded as "driver" for admin visibility.
// Adding a day1 pickup auto-mirrors a day2 dropoff (laundry returns).
export async function POST(request) {
  const body = await request.json();
  const { pin, day, address, unit, entryMethod, type } = body;

  const area = getAreaForPin(pin);
  if (!area) return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  if (!day || !address) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const weekId = getCurrentWeekId();
    await saveRouteAddWithMirror(
      area,
      weekId,
      day,
      address,
      unit || "",
      entryMethod || "See notes",
      type || "pickup",
      "driver",
    );
    return NextResponse.json({ status: "ok", area, day, address, unit });
  } catch (err) {
    console.error("Driver add-stop error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
