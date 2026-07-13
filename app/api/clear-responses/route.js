import { NextResponse } from "next/server";
import { getCurrentWeekId } from "../../../lib/sheets";
import { google } from "googleapis";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// POST /api/clear-responses?area=uptown
// Clears all pickup responses for the current week and area
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  const pin = searchParams.get("pin");
  const week = searchParams.get("week") || getCurrentWeekId();

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_PRIVATE_KEY || "")
          .replace(/\\n/g, "\n")
          .replace(/\\u003d/g, "="),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const SHEET_ID = process.env.GOOGLE_SHEET_ID;
    const tabName = "Pickup Responses";

    // Read ALL rows (full column range — the tab grows every week, so a fixed
    // bound like A1:F500 would silently miss responses past that row).
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:F`,
    });

    const rows = res.data.values || [];
    if (rows.length <= 1) {
      return NextResponse.json({ cleared: 0, message: "No responses to clear." });
    }

    // Collect the 0-based sheet row indices that match this week+area (skip header).
    const matchIndices = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] === week && row[1] === area) matchIndices.push(i);
    }

    if (matchIndices.length === 0) {
      return NextResponse.json({ cleared: 0, message: `No responses for ${area} week ${week}.` });
    }

    // Delete exactly those rows via deleteDimension — correct regardless of how
    // many total rows the tab has. Delete highest index first so earlier indices
    // don't shift underneath us.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: "sheets(properties(sheetId,title))",
    });
    const tab = (meta.data.sheets || []).find((s) => s.properties.title === tabName);
    if (!tab) {
      return NextResponse.json({ error: `Tab "${tabName}" not found` }, { status: 500 });
    }
    const sheetId = tab.properties.sheetId;
    const requests = matchIndices
      .sort((a, b) => b - a)
      .map((i) => ({
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: i, endIndex: i + 1 },
        },
      }));
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });

    return NextResponse.json({
      cleared: matchIndices.length,
      message: `Cleared ${matchIndices.length} response(s) for ${area} week ${week}.`,
    });
  } catch (err) {
    console.error("Clear responses error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
