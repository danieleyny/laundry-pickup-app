import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/admin/send-now { pin, area, day }
// Thin wrapper that delegates to the existing cron handler via the
// admin-PIN code path. This makes the manual "Send reminders now" button
// share exactly the same task-building + Resend send path as the daily
// 7:20 AM cron — single source of truth, no copy-paste cards.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { pin, area, day } = body;
  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!area || !day) {
    return NextResponse.json({ error: "area and day required" }, { status: 400 });
  }

  // Forward to the cron handler with admin-forced day. This bypasses the
  // morning time-window guard and the same-day dedup, executes the same
  // recipient-selection + sendBccEmail path, records last_cron_run_*,
  // and returns the same task results structure as the cron.
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host");
  const base = `${proto}://${host}`;
  const url = `${base}/api/cron/send-scheduled-emails?pin=${encodeURIComponent(pin)}&day=${encodeURIComponent(day)}`;

  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => null);
    return NextResponse.json(
      {
        ok: res.ok,
        triggeredBy: "admin-send-now",
        area,
        day,
        cronResponse: data,
      },
      { status: res.status },
    );
  } catch (err) {
    console.error("Admin send-now error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
