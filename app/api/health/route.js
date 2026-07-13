import { NextResponse } from "next/server";

// GET /api/health - Debug endpoint to verify env vars and Google connection (v2)
export async function GET() {
  const key = process.env.GOOGLE_PRIVATE_KEY || "";
  const parsedKey = key.replace(/\\n/g, "\n").replace(/\\u003d/g, "=");

  return NextResponse.json({
    status: "ok",
    env: {
      ADMIN_PIN_SET: !!process.env.ADMIN_PIN,
      ADMIN_PIN_LENGTH: process.env.ADMIN_PIN?.length || 0,
      GOOGLE_SHEET_ID_SET: !!process.env.GOOGLE_SHEET_ID,
      GOOGLE_SERVICE_ACCOUNT_EMAIL_SET: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY_SET: !!process.env.GOOGLE_PRIVATE_KEY,
      GOOGLE_PRIVATE_KEY_STARTS_WITH: key.substring(0, 30),
      GOOGLE_PRIVATE_KEY_HAS_REAL_NEWLINES: key.includes("\n") && !key.includes("\\n"),
      GOOGLE_PRIVATE_KEY_HAS_ESCAPED_NEWLINES: key.includes("\\n"),
      PARSED_KEY_STARTS_CORRECTLY: parsedKey.startsWith("-----BEGIN PRIVATE KEY-----"),
      PARSED_KEY_ENDS_CORRECTLY: parsedKey.trimEnd().endsWith("-----END PRIVATE KEY-----") || parsedKey.trimEnd().endsWith("-----END PRIVATE KEY-----\n"),
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "(not set)",
    },
  });
}
