import { NextResponse } from "next/server";

// GET /api/health - Debug endpoint to verify env vars are loaded
export async function GET() {
  return NextResponse.json({
    status: "ok",
    env: {
      ADMIN_PIN_SET: !!process.env.ADMIN_PIN,
      ADMIN_PIN_LENGTH: process.env.ADMIN_PIN?.length || 0,
      GOOGLE_SHEET_ID_SET: !!process.env.GOOGLE_SHEET_ID,
      GOOGLE_SERVICE_ACCOUNT_EMAIL_SET: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY_SET: !!process.env.GOOGLE_PRIVATE_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "(not set)",
    },
  });
}
