import { NextResponse } from "next/server";
import { buildEtaProfile } from "../../../lib/eta-model";

export const dynamic = "force-dynamic";

// GET /api/eta-model?area=<area>
// Public (no auth) — the driver UI reads this on route load to seed its
// ETA constants with learned values from history. Falls back to the
// hardcoded May 23 baseline if there isn't enough clean data yet.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area");
  if (!area) return NextResponse.json({ error: "area required" }, { status: 400 });
  try {
    const profile = await buildEtaProfile(area);
    return NextResponse.json(profile);
  } catch (err) {
    console.error("ETA model error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
