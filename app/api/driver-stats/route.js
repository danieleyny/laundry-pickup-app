import { NextResponse } from "next/server";
import { google } from "googleapis";
import { buildEtaProfile } from "../../../lib/eta-model";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// GET /api/driver-stats?pin=ADMIN_PIN[&days=7|30|90|365|all]
// Aggregates driver progress into summary stats over the requested time window
// (default: all-time). Routes are bucketed by their last-activity timestamp.
// Computes time-per-stop from consecutive marked timestamps within each route,
// plus per-day and per-week stop averages across the window.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional time window: ?days=7 | 30 | 90 | 365; omitted or "all" → all-time.
  const daysParam = searchParams.get("days");
  const windowDays = daysParam && daysParam !== "all" ? parseInt(daysParam, 10) : null;
  const cutoffMs = windowDays && windowDays > 0 ? Date.now() - windowDays * 24 * 60 * 60 * 1000 : null;

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

    // Apply the requested time window (by each route's last-activity timestamp).
    const routeEndMs = (route) =>
      route.entries.length ? new Date(route.entries[route.entries.length - 1].time).getTime() : null;
    const windowedRoutes = cutoffMs
      ? routes.filter((r) => {
          const e = routeEndMs(r);
          return e !== null && e >= cutoffMs;
        })
      : routes;

    // Distinct operating days (ET calendar date) and ISO weeks in the window,
    // used for the per-day / per-week stop averages.
    const etDate = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const daySet = new Set();
    const weekSet = new Set();

    // Aggregate
    let totalStops = 0;
    let totalCompleted = 0;
    let totalCollections = 0;
    let totalIssuesAccess = 0;
    let totalIssuesNoBag = 0;
    let totalIssuesDelivery = 0;
    const allDeltasMs = [];

    const perRoute = [];
    const byArea = {
      downtown: { stops: 0, collections: 0, issuesAccess: 0, issuesNoBag: 0, issuesDelivery: 0, deltasMs: [] },
      uptown: { stops: 0, collections: 0, issuesAccess: 0, issuesNoBag: 0, issuesDelivery: 0, deltasMs: [] },
    };

    for (const route of windowedRoutes) {
      const completed = route.entries; // already filtered to ones with time
      // Only count days/weeks that actually had recorded stops, so empty legacy
      // rows don't dilute the per-day / per-week averages.
      const routeEnd = completed.length ? completed[completed.length - 1].time : null;
      if (routeEnd) {
        daySet.add(etDate(routeEnd));
        weekSet.add(route.weekId);
      }
      const collections = completed.filter((e) => e.status === "collected").length;
      const issuesAccess = completed.filter((e) => e.status === "access_unavailable").length;
      const issuesNoBag = completed.filter((e) => e.status === "no_bag").length;
      const issuesDelivery = completed.filter((e) => e.status === "delivery_failed").length;

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
        issuesDelivery,
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
      totalIssuesDelivery += issuesDelivery;

      if (byArea[route.area]) {
        byArea[route.area].stops += completed.length;
        byArea[route.area].collections += collections;
        byArea[route.area].issuesAccess += issuesAccess;
        byArea[route.area].issuesNoBag += issuesNoBag;
        byArea[route.area].issuesDelivery += issuesDelivery;
      }
    }

    const overallAvgDelta = allDeltasMs.length
      ? allDeltasMs.reduce((a, b) => a + b, 0) / allDeltasMs.length
      : 0;

    const numDays = daySet.size;
    const numWeeks = weekSet.size;
    const avgStopsPerDay = numDays ? Math.round((totalStops / numDays) * 10) / 10 : 0;
    const avgStopsPerWeek = numWeeks ? Math.round((totalStops / numWeeks) * 10) / 10 : 0;

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
        issuesDelivery: a.issuesDelivery,
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
      window: { days: windowDays, label: windowLabel(windowDays), numDays, numWeeks },
      summary: {
        totalRoutes: windowedRoutes.length,
        totalStops,
        totalCollections,
        totalIssuesAccess,
        totalIssuesNoBag,
        totalIssuesDelivery,
        avgMinutesPerStop: Math.round((overallAvgDelta / 60000) * 10) / 10,
        avgStopsPerDay,
        avgStopsPerWeek,
        numDays,
        numWeeks,
        issueRatePct:
          totalStops > 0
            ? Math.round(((totalIssuesAccess + totalIssuesNoBag + totalIssuesDelivery) / totalStops) * 1000) / 10
            : 0,
      },
      byArea: areaSummary,
      routes: perRoute,
      // Flat fields for the AnalyticsTab StatTiles
      totalStops,
      collectedCount: totalCollections,
      accessCount: totalIssuesAccess,
      noBagCount: totalIssuesNoBag,
      deliveryFailedCount: totalIssuesDelivery,
      avgPerStopMin: Math.round((overallAvgDelta / 60000) * 10) / 10,
      avgStopsPerDay,
      avgStopsPerWeek,
      numDays,
      numWeeks,
      dataQuality,
    });
  } catch (err) {
    console.error("Driver stats error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function windowLabel(days) {
  if (!days) return "All time";
  if (days <= 7) return "Last 7 days";
  if (days <= 31) return "Last 30 days";
  if (days <= 92) return "Last 90 days";
  if (days <= 366) return "Last 12 months";
  return `Last ${days} days`;
}

function emptyStats() {
  return {
    window: { days: null, label: "All time", numDays: 0, numWeeks: 0 },
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
