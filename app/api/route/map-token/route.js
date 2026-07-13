import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/route/map-token
// Public — Mapbox tokens are designed to be embedded in client requests
// (rate-limited and scoped by the account, not by secrecy). Returning
// from a server endpoint lets us swap it without redeploying, and lets us
// gate it behind a feature flag if we ever want to.
export async function GET() {
  return NextResponse.json({ token: process.env.MAPBOX_TOKEN || null });
}
