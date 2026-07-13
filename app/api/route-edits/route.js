import { NextResponse } from "next/server";
import {
  saveRouteEdit,
  removeRouteEdit,
  saveRouteAddWithMirror,
  removeRouteAddWithMirror,
  getCurrentWeekId,
} from "../../../lib/sheets";

// POST /api/route-edits — save a route edit (add or remove)
export async function POST(request) {
  const body = await request.json();
  const { pin, area, day, action, address, unit, entryMethod, type } = body;

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!area || !day || !action || !address) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const weekId = getCurrentWeekId();

  try {
    if (action === "add") {
      // Day1 pickup adds auto-mirror to day2 as a dropoff (laundry returns
      // on the second day of the area's week).
      await saveRouteAddWithMirror(area, weekId, day, address, unit, entryMethod, type, "admin");
    } else if (action === "remove") {
      await saveRouteEdit(area, weekId, day, "remove", address, unit, "", "");
    } else if (action === "undo-remove") {
      // Undo a previous removal
      await removeRouteEdit(area, weekId, day, "remove", address, unit);
    } else if (action === "undo-add") {
      // Undo a previous manual addition (and any day2 mirror).
      await removeRouteAddWithMirror(area, weekId, day, address, unit);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ status: "ok", action, address });
  } catch (err) {
    console.error("Route edit error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
