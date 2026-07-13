import { NextResponse } from "next/server";
import { sendBccEmail } from "../../../../lib/email";
import { makeToken } from "../../../../lib/confirm-token";
import { getCurrentWeekId, AREA_CONFIG } from "../../../../lib/sheets";
import { buildMainEmail } from "../../../../lib/email-templates";

export const dynamic = "force-dynamic";

// POST /api/admin/test-confirm-link { pin, email, area, day?, week?, send?:true }
//
// Sends the SAME email a real customer receives on the morning cron — same
// subject, same body, same HMAC-signed one-tap CTAs. Returns the raw links
// in the JSON so they can also be verified by pasting them into a browser.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { pin, email, area = "downtown", day, send } = body;

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const config = AREA_CONFIG[area];
  if (!config) return NextResponse.json({ error: "Invalid area" }, { status: 400 });

  const week = body.week || getCurrentWeekId();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pickup.laundryday.nyc";

  const url = (d) => {
    const t = makeToken({ email, day: d, area, week });
    return `${baseUrl}/api/confirm?e=${encodeURIComponent(email)}&day=${encodeURIComponent(d)}&area=${encodeURIComponent(area)}&w=${encodeURIComponent(week)}&t=${t}`;
  };

  const links = {
    link: day ? url(day) : null,
    linkDay1: url(config.day1),
    linkDay2: url(config.day2),
  };

  let sendResult = null;
  if (send) {
    // Use the exact same builder + linkContext substitution path as the cron.
    const built = buildMainEmail(area);
    sendResult = await sendBccEmail({
      recipients: [email],
      subject: built.subject,
      text: built.text,
      html: built.html,
      linkContext: { area, week, day1: config.day1, day2: config.day2 },
    });
  }

  return NextResponse.json({
    week,
    area,
    ...links,
    sendResult,
  });
}
