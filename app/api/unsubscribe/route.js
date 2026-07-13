import { NextResponse } from "next/server";
import { addOptOut } from "../../../lib/sheets";

export const dynamic = "force-dynamic";

// GET /api/unsubscribe?email=foo@bar.com
// One-click opt-out. Adds email to the Opt-outs tab and redirects to a confirmation page.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").toLowerCase().trim();

  if (!email || !email.includes("@")) {
    const url = new URL("/unsubscribe", request.url);
    url.searchParams.set("status", "error");
    return NextResponse.redirect(url);
  }

  try {
    await addOptOut(email, "self");
    const url = new URL("/unsubscribe", request.url);
    url.searchParams.set("status", "ok");
    url.searchParams.set("email", email);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("Unsubscribe error:", err);
    const url = new URL("/unsubscribe", request.url);
    url.searchParams.set("status", "error");
    return NextResponse.redirect(url);
  }
}
