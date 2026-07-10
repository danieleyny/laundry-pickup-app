import { NextResponse } from "next/server";
import { getCustomers, getPickupResponses, getCurrentWeekId, AREA_CONFIG } from "../../../lib/sheets";

// GET /api/generate-email-links?area=uptown&week=2026-W13&pin=1234
// Generates the personalized confirmation links for each customer
// to embed in your pickup reminder email
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  const week = searchParams.get("week") || getCurrentWeekId();
  const pin = searchParams.get("pin");
  const onlyRemaining = searchParams.get("onlyRemaining") === "true";

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = AREA_CONFIG[area];
  if (!config) {
    return NextResponse.json({ error: "Invalid area: " + area }, { status: 400 });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app";

    let customers = await getCustomers(area);

    // If onlyRemaining, filter out those who already confirmed
    if (onlyRemaining) {
      const responses = await getPickupResponses(area, week);
      const confirmedEmails = new Set(
        responses.map((r) => r[2]?.toLowerCase()).filter(Boolean)
      );
      customers = customers.filter(
        (c) => !c.emails.some((e) => confirmedEmails.has(e.toLowerCase()))
      );
    }

    // Generate links for each customer
    const customerLinks = customers.map((c) => {
      const email = c.emails[0]; // Use primary email for the link
      const day1Link = `${appUrl}/api/confirm?email=${encodeURIComponent(email)}&day=${config.day1}&area=${area}&week=${week}`;
      const day2Link = `${appUrl}/api/confirm?email=${encodeURIComponent(email)}&day=${config.day2}&area=${area}&week=${week}`;

      return {
        name: c.name,
        email: c.emailRaw,
        emails: c.emails,
        day1: config.day1,
        day2: config.day2,
        day1Link,
        day2Link,
      };
    });

    // Also generate the BCC email list
    const allEmails = customers.flatMap((c) => c.emails);

    // Generate a sample HTML email body with buttons
    const sampleEmailHtml = `
Hi there! 👋

It's pickup day! Would you like us to pick up your laundry this week?

Just tap the day that works for you:

[PICK UP ${config.day1.toUpperCase()}]  →  The link will be unique per customer
[PICK UP ${config.day2.toUpperCase()}]  →  The link will be unique per customer

If you don't need a pickup this week, no action needed.

Thanks!
`.trim();

    return NextResponse.json({
      customerLinks,
      bccEmails: allEmails.join(", "),
      totalCustomers: customers.length,
      sampleEmailHtml,
      config,
      week,
      note: "IMPORTANT: Because each customer gets unique links, you'll need to send individual emails (not BCC). The dashboard has a 'Send Emails' feature that generates a mailto link for each customer, or you can use the bulk email template.",
    });
  } catch (err) {
    console.error("Generate links error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
