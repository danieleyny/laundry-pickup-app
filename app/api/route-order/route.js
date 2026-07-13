import { NextResponse } from "next/server";
import { saveRouteOrder, getCurrentWeekId } from "../../../lib/sheets";

// POST /api/route-order — save the current ordered list of stops
// Body: { pin, area, day, order: ["address|unit", ...] }
export async function POST(request) {
  const body = await request.json();
  const { pin, area, day, order } = body;

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!area || !day || !Array.isArray(order)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const weekId = getCurrentWeekId();

  try {
    await saveRouteOrder(area, weekId, day, order);
    return NextResponse.json({ status: "ok", count: order.length });
  } catch (err) {
    console.error("Save route order error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
