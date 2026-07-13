import { NextResponse } from "next/server";
import { getCurrentWeekId } from "../../../../lib/sheets";
import { google } from "googleapis";

// Force dynamic rendering — uses request data, must not be statically optimized
export const dynamic = "force-dynamic";

const TAB = "Pickup Responses";
// Pickup Responses columns: A=Week ID, B=Area, C=Email, D=Day, E=Timestamp, F=Customer Name

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || "")
        .replace(/\\n/g, "\n")
        .replace(/\\u003d/g, "="),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// GET /api/admin/submissions?pin=&area=&week=&day=
// Lists individual pickup confirmations (submissions) for the week, optionally
// filtered to one day. This is what powers the per-submission "remove" UI.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  const area = searchParams.get("area") || "uptown";
  const week = searchParams.get("week") || getCurrentWeekId();
  const day = searchParams.get("day"); // optional filter

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `'${TAB}'!A:F`,
    });
    const rows = res.data.values || [];
    const submissions = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r[0] !== week || r[1] !== area) continue;
      if (day && (r[3] || "").toLowerCase() !== day.toLowerCase()) continue;
      submissions.push({
        week: r[0] || "",
        area: r[1] || "",
        email: r[2] || "",
        day: r[3] || "",
        timestamp: r[4] || "",
        name: r[5] || "",
      });
    }
    // Newest first
    submissions.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    return NextResponse.json({ submissions, week, area });
  } catch (err) {
    console.error("List submissions error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/submissions  body: { pin, area, week?, email, day, timestamp? }
// Removes ONE submission (a single confirmation row). Matches on
// week+area+email+day; if `timestamp` is supplied it must also match, so an
// admin can delete one specific row when a customer has multiple.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { pin, area, email, day } = body;
  const week = body.week || getCurrentWeekId();
  const timestamp = body.timestamp || null;

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!area || !email || !day) {
    return NextResponse.json({ error: "Missing required fields (area, email, day)" }, { status: 400 });
  }

  try {
    const sheets = getSheetsClient();
    const SHEET_ID = process.env.GOOGLE_SHEET_ID;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${TAB}'!A:F`,
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) {
      return NextResponse.json({ removed: 0, message: "No submissions to remove." });
    }

    const emailLc = email.toLowerCase();
    const dayLc = day.toLowerCase();

    // Find the 0-based sheet row indices of matching rows (skip header at index 0).
    const matchIndices = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const match =
        r[0] === week &&
        r[1] === area &&
        (r[2] || "").toLowerCase() === emailLc &&
        (r[3] || "").toLowerCase() === dayLc &&
        (timestamp ? r[4] === timestamp : true);
      if (match) matchIndices.push(i); // i is the 0-based row index in the sheet
    }

    if (matchIndices.length === 0) {
      return NextResponse.json({ removed: 0, message: "No matching submission found." });
    }

    // Delete the specific row(s) via deleteDimension — robust regardless of how
    // many total rows the tab has (the Pickup Responses tab grows every week, so
    // a fixed-range clear/rewrite would corrupt rows beyond the hardcoded bound).
    // Delete highest index first so earlier indices don't shift underneath us.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: "sheets(properties(sheetId,title))",
    });
    const tab = (meta.data.sheets || []).find((s) => s.properties.title === TAB);
    if (!tab) {
      return NextResponse.json({ error: `Tab "${TAB}" not found` }, { status: 500 });
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
      removed: matchIndices.length,
      message: `Removed ${matchIndices.length} submission(s) for ${email} (${day}).`,
    });
  } catch (err) {
    console.error("Remove submission error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
