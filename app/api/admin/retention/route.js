import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getCustomers, getOptOuts, getStaleCustomers, AREA_CONFIG } from "../../../../lib/sheets";

export const dynamic = "force-dynamic";

// GET /api/admin/retention?pin&area
// Returns:
//   - confirmationsByWeek[]: { weekId, count }      (last 12 weeks of activity)
//   - activeCustomerCount                            (any confirmation in last 4 weeks)
//   - staleCustomers[]                               (8+ weeks no confirmation)
//   - winBackCandidates[]                            (was active, now stale ≥6 wks)
//   - totalCustomers, optOutCount
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("pin") !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const area = searchParams.get("area") || "downtown";
  if (!AREA_CONFIG[area]) return NextResponse.json({ error: "Invalid area" }, { status: 400 });

  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    );
    const sheets = google.sheets({ version: "v4", auth });
    const [{ data: respData }, customers, optOuts, stale] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "'Pickup Responses'!A:F",
      }),
      getCustomers(area),
      getOptOuts(),
      getStaleCustomers(area, 8),
    ]);
    const rows = (respData.values || []).slice(1);
    const byEmailLatest = new Map();
    const weekCounts = new Map();
    for (const r of rows) {
      const [weekId, rArea, email, _day, ts] = r;
      if (rArea !== area) continue;
      const k = `${weekId}|${(email || "").toLowerCase()}`;
      if (byEmailLatest.has(k)) continue; // dedupe per (week,email)
      byEmailLatest.set(k, true);
      weekCounts.set(weekId, (weekCounts.get(weekId) || 0) + 1);
    }
    const confirmationsByWeek = [...weekCounts.entries()]
      .map(([weekId, count]) => ({ weekId, count }))
      .sort((a, b) => a.weekId.localeCompare(b.weekId))
      .slice(-12);

    // Active: at least one confirmation in the last 4 weeks (use last 4 weeks of data)
    const recentWeeks = new Set(confirmationsByWeek.slice(-4).map((w) => w.weekId));
    const activeEmails = new Set();
    for (const r of rows) {
      const [weekId, rArea, email] = r;
      if (rArea !== area) continue;
      if (recentWeeks.has(weekId)) activeEmails.add((email || "").toLowerCase());
    }
    const activeCustomerCount = customers.filter((c) =>
      c.emails.some((e) => activeEmails.has(e.toLowerCase())),
    ).length;

    // Win-back candidates: previously had confirmations, now stale ≥6 weeks
    const winBackCandidates = stale
      .filter((s) => s.lastConfirmedMs && (Date.now() - s.lastConfirmedMs) / (7 * 24 * 60 * 60 * 1000) >= 6)
      .map((s) => ({
        name: s.name,
        address: s.address,
        unit: s.unit,
        emails: s.emails,
        lastConfirmedDate: s.lastConfirmedDate,
      }));

    return NextResponse.json({
      confirmationsByWeek,
      activeCustomerCount,
      staleCustomers: stale,
      winBackCandidates,
      totalCustomers: customers.length,
      optOutCount: customers.filter((c) =>
        c.emails.some((e) => optOuts.has(e.toLowerCase().trim())),
      ).length,
    });
  } catch (err) {
    console.error("Retention API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
