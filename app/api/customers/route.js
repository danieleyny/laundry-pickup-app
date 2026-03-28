import { NextResponse } from "next/server";
import { getCustomers, AREA_CONFIG } from "../../../lib/sheets";

// GET /api/customers?area=uptown&pin=1234
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  // PIN auth temporarily disabled
  // const pin = searchParams.get("pin");
  // if (pin !== process.env.ADMIN_PIN) {
  //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // }

  try {
    const customers = await getCustomers(area);
    const config = AREA_CONFIG[area];
    return NextResponse.json({ customers, config });
  } catch (err) {
    console.error("Customers error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
