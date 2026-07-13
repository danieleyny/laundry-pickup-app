import { NextResponse } from "next/server";
import { google } from "googleapis";
import { buildEtaProfile } from "../../../lib/eta-model";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// GET /api/driver-stats?pin=ADMIN_PIN
// Aggregates driver progress data across all routes into summary stats.
// Computes time-per-stop from consecutive marked timestamps within each route.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sheets = google.sheets({
      version: "v4",
      auth: new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: (process.env.GOOGLE_PRIVATE_KEY || "")
            .replace(/\\n/g, "\n")
            .replace(/\\u003d/g, "="),
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      }),
    });

    // Pull all driver progress rows
    let progressRows = [];
    try {
      const progressRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "'Driver Progress'!A:E",
      });
      progressRows = progressRes.data.values || [];
    } catch (e) {
      // Tab might not exist yet — return empty stats
      return NextResponse.json(emptyStats());
    }

    // Pull all driver issues for issue-type breakdown
    let issueRows = [];
    try {
      const issuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "'Driver Issues'!A1:I500",
      });
      issueRows = issuesRes.data.values || [];
    } catch {}

    // Parse routes
    const routes = []; // [{ weekId, area, day, entries: [{ key, status, time }] }]
    for (let i = 1; i < progressRows.length; i++) {
      const r = progressRows[i];
      const [weekId, area, day, json] = r;
      if (!weekId || !area || !day) continue;
      let parsed = {};
      try { parsed = JSON.parse(json || "{}"); } catch { continue; }
      const entries = Object.entries(parsed).map(([key, val]) => ({
        key,
        status: val.status,
        time: val.time,
      })).filter((e) => e.time);
      // Sort by time so deltas reflect actual driver order
      entries.sort((a, b) => new Date(a.time) - new Date(b.time));
      routes.push({ weekId, area, day, entries });
    }

    // Aggregate
    let totalStops = 0;
    let totalCompleted = 0;
    let totalCollections = 0;
    let totalIssuesAccess = 0;
    let totalIssuesNoBag = 0;
    const allDeltasMs = [];

    const perRoute = [];
    const byArea = {
      downtown: { stops: 0, collections: 0, issuesAccess: 0, issuesNoBag: 0, deltasMs: [] },
      uptown: { stops: 0, collections: 0, issuesAccess: 0, issuesNoBag: 0, deltasMs: [] },
    };

    for (const route of routes) {
      const completed = route.entries; // already filtered to ones with time
      const collections = completed.filter((e) => e.status === "collected").length;
      const issuesAccess = completed.filter((e) => e.status === "access_unavailable").length;
      const issuesNoBag = completed.filter((e) => e.status === "no_bag").length;

      // Compute deltas between consecutive stops (first stop has no delta)
      const deltas = [];
      for (let i = 1; i < completed.length; i++) {
        const d = new Date(completed[i].time) - new Date(completed[i - 1].time);
        if (d > 0 && d < 60 * 60 * 1000) { // skip zero/negative and >1 hour outliers
          deltas.push(d);
          allDeltasMs.push(d);
          if (byArea[route.area]) byArea[route.area].deltasMs.push(d);
        }
      }

      const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
      const totalDuration =
        completed.length > 1
          ? new Date(completed[completed.length - 1].time) - new Date(completed[0].time)
          : 0;

      perRoute.push({
        weekId: route.weekId,
        area: route.area,
        day: route.day,
        completed: completed.length,
        collections,
        issuesAccess,
        issuesNoBag,
        avgMinutesPerStop: Math.round((avgDelta / 60000) * 10) / 10,
        totalDurationMinutes: Math.round(totalDuration / 60000),
        startTime: completed[0]?.time || null,
        endTime: completed[completed.length - 1]?.time || null,
      });

      totalStops += completed.length;
      totalCompleted += completed.length;
      totalCollections += collections;
      totalIssuesAccess += issuesAccess;
      totalIssuesNoBag += issuesNoBag;

      if (byArea[route.area]) {
        byArea[route.area].stops += completed.length;
        byArea[route.area].collections += collections;
        byArea[route.area].issuesAccess += issuesAccess;
        byArea[route.area].issuesNoBag += issuesNoBag;
      }
    }

    const overallAvgDelta = allDeltasMs.length
      ? allDeltasMs.reduce((a, b) => a + b, 0) / allDeltasMs.length
      : 0;

    const areaSummary = {};
    for (const area of ["downtown", "uptown"]) {
      const a = byArea[area];
      const avg = a.deltasMs.length
        ? a.deltasMs.reduce((x, y) => x + y, 0) / a.deltasMs.length
        : 0;
      areaSummary[area] = {
        totalStops: a.stops,
        totalCollections: a.collections,
        issuesAccess: a.issuesAccess,
        issuesNoBag: a.issuesNoBag,
        avgMinutesPerStop: Math.round((avg / 60000) * 10) / 10,
      };
    }

    // Sort perRoute by date descending so newest routes appear first
    perRoute.sort((a, b) =>
      (b.endTime || "").localeCompare(a.endTime || "")
    );

    // Phase 4 data-quality surface: same outlier detection the eta model uses.
    let dataQuality = null;
    try {
      const profiles = await Promise.all([buildEtaProfile("downtown"), buildEtaProfile("uptown")]);
      dataQuality = {
        cleanRoutes: profiles.reduce((s, p) => s + (p.dataQuality?.cleanRoutes || 0), 0),
        outlierRoutes: profiles.reduce((s, p) => s + (p.dataQuality?.outlierRoutes || 0), 0),
        totalRoutes: profiles.reduce((s, p) => s + (p.dataQuality?.totalRoutes || 0), 0),
        samples: profiles.reduce((s, p) => s + (p.dataQuality?.samples || 0), 0),
      };
    } catch {}

    return NextResponse.json({
      summary: {
        totalRoutes: routes.length,
        totalStops,
        totalCollections,
        totalIssuesAccess,
        totalIssuesNoBag,
        avgMinutesPerStop: Math.round((overallAvgDelta / 60000) * 10) / 10,
        issueRatePct:
          totalStops > 0
            ? Math.round(((totalIssuesAccess + totalIssuesNoBag) / totalStops) * 1000) / 10
            : 0,
      },
      byArea: areaSummary,
      routes: perRoute,
      // Flat fields for the new AnalyticsTab StatTiles
      totalStops,
      collectedCount: totalCollections,
      noBagCount: totalIssuesNoBag,
      avgPerStopMin: Math.round((overallAvgDelta / 60000) * 10) / 10,
      dataQuality,
    });
  } catch (err) {
    console.error("Driver stats error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function emptyStats() {
  return {
    summary: {
      totalRoutes: 0,
      totalStops: 0,
      totalCollections: 0,
      totalIssuesAccess: 0,
      totalIssuesNoBag: 0,
      avgMinutesPerStop: 0,
      issueRatePct: 0,
    },
    byArea: {
      downtown: { totalStops: 0, totalCollections: 0, issuesAccess: 0, issuesNoBag: 0, avgMinutesPerStop: 0 },
      uptown: { totalStops: 0, totalCollections: 0, issuesAccess: 0, issuesNoBag: 0, avgMinutesPerStop: 0 },
    },
    routes: [],
  };
}
