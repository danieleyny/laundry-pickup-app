import { NextResponse } from "next/server";
import { getRecentBounces } from "../../../../lib/sheets";

export const dynamic = "force-dynamic";

// GET /api/admin/bounces?pin=ADMIN_PIN
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const bounces = await getRecentBounces(100);
    return NextResponse.json({ bounces, total: bounces.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
