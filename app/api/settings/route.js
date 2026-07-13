import { NextResponse } from "next/server";
import { getSetting, setSetting } from "../../../lib/sheets";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// GET /api/settings?pin=1234 — returns all known settings
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [
      emailSchedulingEnabled,
      driverEmailsEnabled,
      testModeEnabled,
      routeOptimizerEnabled,
      etaAlertsEnabled,
      etaAlertLeadMin,
      lastCronRunTime,
      lastCronRunStatus,
      lastCronRunSummary,
    ] = await Promise.all([
      getSetting("email_scheduling_enabled", "false"),
      getSetting("driver_emails_enabled", "false"),
      getSetting("test_mode_enabled", "false"),
      getSetting("route_optimizer_enabled", "false"),
      getSetting("eta_alerts_enabled", "false"),
      getSetting("eta_alert_lead_min", "20"),
      getSetting("last_cron_run_time", ""),
      getSetting("last_cron_run_status", ""),
      getSetting("last_cron_run_summary", ""),
    ]);
    return NextResponse.json({
      email_scheduling_enabled: emailSchedulingEnabled === "true",
      driver_emails_enabled: driverEmailsEnabled === "true",
      test_mode_enabled: testModeEnabled === "true",
      route_optimizer_enabled: routeOptimizerEnabled === "true",
      eta_alerts_enabled: etaAlertsEnabled === "true",
      eta_alert_lead_min: parseInt(etaAlertLeadMin, 10) || 20,
      last_cron_run_time: lastCronRunTime,
      last_cron_run_status: lastCronRunStatus,
      last_cron_run_summary: lastCronRunSummary,
    });
  } catch (err) {
    console.error("Settings GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/settings — { pin, key, value }
export async function POST(request) {
  const body = await request.json();
  const { pin, key, value } = body;

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  try {
    await setSetting(key, value);
    return NextResponse.json({ status: "ok", key, value });
  } catch (err) {
    console.error("Settings POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
