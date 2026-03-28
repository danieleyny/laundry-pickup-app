import { NextResponse } from "next/server";
import { getCurrentWeekId } from "../../../lib/sheets";
import { google } from "googleapis";

// POST /api/clear-responses?area=uptown
// Clears all pickup responses for the current week and area
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  const week = searchParams.get("week") || getCurrentWeekId();

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

    // Read all rows
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1:F500`,
    });

    const rows = res.data.values || [];
    if (rows.length <= 1) {
      return NextResponse.json({ cleared: 0, message: "No responses to clear." });
    }

    // Find rows to keep (header + rows that don't match this week/area)
    const header = rows[0];
    const keep = [header];
    let cleared = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] === week && row[1] === area) {
        cleared++;
      } else {
        keep.push(row);
      }
    }

    // Clear the entire sheet and rewrite kept rows
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1:F500`,
    });

    if (keep.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1`,
        valueInputOption: "RAW",
        resource: { values: keep },
      });
    }

    return NextResponse.json({
      cleared,
      message: `Cleared ${cleared} response(s) for ${area} week ${week}.`,
    });
  } catch (err) {
    console.error("Clear responses error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
