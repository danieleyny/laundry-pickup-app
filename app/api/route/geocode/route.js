import { NextResponse } from "next/server";
import { geocodeAddresses } from "../../../../lib/routing";
import { getAreaForPin } from "../../../../lib/driver-auth";

export const dynamic = "force-dynamic";

// POST /api/route/geocode { pin, addresses: [...] }
// Used by the driver Map view to resolve each stop to a lat/lng.
// Pulls from the Geocache (no Mapbox bill for repeat addresses).
export async function POST(request) {
  const { pin, addresses } = await request.json().catch(() => ({}));
  if (!getAreaForPin(pin) && pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return NextResponse.json({ results: {} });
  }
  try {
    const results = await geocodeAddresses(addresses.slice(0, 100));
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
