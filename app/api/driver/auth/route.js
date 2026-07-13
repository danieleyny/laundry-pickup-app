import { NextResponse } from "next/server";
import { getAreaForPin } from "../../../../lib/driver-auth";

// POST /api/driver/auth — { pin } → { area }
export async function POST(request) {
  const { pin } = await request.json();
  const area = getAreaForPin(pin);
  if (!area) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }
  return NextResponse.json({ area });
}
