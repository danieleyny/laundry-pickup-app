import { NextResponse } from "next/server";
import { getSetting } from "../../../lib/sheets";

export const dynamic = "force-dynamic";

// GET /api/test-mode
// Public (no auth) — the driver UI checks this to know whether to show
// the test-mode banner and treat actions as non-persistent.
// Returns: { enabled: boolean }
export async function GET() {
  try {
    const value = await getSetting("test_mode_enabled", "false");
    return NextResponse.json({ enabled: value === "true" });
  } catch (err) {
    // Fail closed — if we can't read the setting, assume NOT in test mode
    // so live data is never silently dropped.
    console.warn("test-mode read failed:", err.message);
    return NextResponse.json({ enabled: false });
  }
}
