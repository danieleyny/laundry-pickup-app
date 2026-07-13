import { NextResponse } from "next/server";
import {
  resolveWeekForDriverDay,
  mergeDriverProgress,
  getSetting,
} from "../../../../lib/sheets";
import { getAreaForPin } from "../../../../lib/driver-auth";
import { fireApproachAlerts } from "../../../../lib/eta-alerts";

// POST /api/driver/progress
// Body: { pin, day, key, status }
//   key = "address|unit" (canonical stop identifier)
//   status = "collected" | "access_unavailable" | "no_bag" | "delivery_failed" | "pending"
export async function POST(request) {
  const body = await request.json();
  const { pin, day, key, status } = body;

  const area = getAreaForPin(pin);
  if (!area) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }
  if (!day || !key || !status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Test mode: pretend the write succeeded but persist nothing.
  // Driver UI updates its optimistic local state, but a page reload
  // restores everything to its server-side pending state.
  const testMode = (await getSetting("test_mode_enabled", "false")) === "true";
  if (testMode) {
    return NextResponse.json({ ok: true, testMode: true });
  }

  // For dropoff-day routes (uptown Mon, downtown Fri), the week of the actual
  // pickup is what matters — see resolveWeekForDriverDay() in lib/sheets.
  const week = resolveWeekForDriverDay(area, day);
  // SAFE merge: re-reads the latest sheet row immediately before writing and
  // merges this single key in — so a stale snapshot from another browser tab
  // can't wipe stops marked from elsewhere. Throws if the read fails rather
  // than silently writing `{}` and clobbering everything.
  let progress;
  try {
    progress = await mergeDriverProgress(area, week, day, {
      [key]: { status, time: new Date().toISOString() },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // Phase 6: fire any newly-due approach alerts (best-effort, never blocks
  // the response — the driver UI only needs to know the mark saved).
  let alertSummary = null;
  if (status === "collected") {
    try {
      alertSummary = await fireApproachAlerts({ area, day, weekId: week });
    } catch (e) {
      console.warn("fireApproachAlerts failed:", e.message);
    }
  }

  return NextResponse.json({ ok: true, progress, alerts: alertSummary });
}
