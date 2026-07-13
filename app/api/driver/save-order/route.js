import { NextResponse } from "next/server";
import { saveRouteOrder, getCurrentWeekId } from "../../../../lib/sheets";
import { getAreaForPin } from "../../../../lib/driver-auth";

// POST /api/driver/save-order
// Body: { pin, day, order: ["address|unit", ...] }
// Driver reorders propagate to the admin route view immediately.
export async function POST(request) {
  const body = await request.json();
  const { pin, day, order } = body;

  const area = getAreaForPin(pin);
  if (!area) return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  if (!day || !Array.isArray(order)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const weekId = getCurrentWeekId();
    await saveRouteOrder(area, weekId, day, order, "driver");
    return NextResponse.json({ status: "ok", count: order.length });
  } catch (err) {
    console.error("Driver save-order error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
