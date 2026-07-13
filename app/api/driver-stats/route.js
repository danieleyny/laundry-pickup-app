import { NextResponse } from "next/server";
import { google } from "googleapis";
import { buildEtaProfile } from "../../../lib/eta-model";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// Bulk-confirm detector (mirrors lib/eta-model): ≥3 stops checked off within a
// 60s window means the driver batch-marked instead of marking as they went, so
// that route's TIMING (per-stop pace, total duration) is unreliable.
const BULK_WINDOW_SEC = 60;
const BULK_THRESHOLD = 3;
function isBulkConfirmed(timesMs) {
  if (timesMs.length < BULK_THRESHOLD) return false;
  const s = [...timesMs].sort((a, b) => a - b);
  for (let i = 0; i <= s.length - BULK_THRESHOLD; i++) {
    if (s[i + BULK_THRESHOLD - 1] - s[i] <= BULK_WINDOW_SEC * 1000) return true;
  }
  return false;
}

// Per-stop segment gap bounds (mirrors lib/eta-model): below 0.5 min = same
// batch, above 45 min = a break/gap, not real per-stop time.
const GAP_FLOOR_MS = 30 * 1000;
const GAP_CEILING_MS = 45 * 60 * 1000;
// A route's first→last span outside this range is a bad timestamp, not a real
// route length — excluded from the duration averages.
const DURATION_FLOOR_MIN = 2;
const DURATION_CEILING_MIN = 600;

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
// Tukey IQR fence — drops remaining outlier segments after the gap bounds.
function filterIqr(arr) {
  if (arr.length < 4) return arr;
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  const q1 = s[Math.floor((n - 1) * 0.25)];
  const q3 = s[Math.floor((n - 1) * 0.75)];
  const r = q3 - q1;
  return arr.filter((v) => v >= q1 - 1.5 * r && v <= q3 + 1.5 * r);
}
const avgPerStopMinFrom = (deltasMs) => {
  const f = filterIqr(deltasMs);
  return f.length ? Math.round((mean(f) / 60000) * 10) / 10 : null;
};

// GET /api/driver-stats?pin=ADMIN_PIN[&days=7|30|90|365|all][&area=downtown|uptown|all][&clean=1]
// Aggregates driver progress into summary stats over the requested time window
// (default: all-time), optionally filtered to one area. Bucketed by last-activity
// timestamp. Computes per-stop pace, total route duration per day, and per-day /
// per-week stop averages. With clean=1, bulk-confirmed routes are excluded from
// TIMING metrics (pace + duration) but still counted for stop volume.
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

  // Optional area filter and outlier exclusion.
  const areaFilter = (searchParams.get("area") || "all").toLowerCase(); // downtown | uptown | all
  const clean = searchParams.get("clean") === "1";

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
      if (areaFilter !== "all" && area.toLowerCase() !== areaFilter) continue;
      let parsed = {};
      try { parsed = JSON.parse(json || "{}"); } catch { continue; }
      const entries = Object.entries(parsed).map(([key, val]) => ({
        key,
        status: val.status,
        time: val.time,
      })).filter((e) => e.time);
      // Sort by time so deltas reflect actual driver order
      entries.sort((a, b) => new Date(a.time) - new Date(b.time));
      const collectedTimesMs = entries
        .filter((e) => e.status === "collected")
        .map((e) => new Date(e.time).getTime());
      routes.push({ weekId, area, day, entries, bulkConfirmed: isBulkConfirmed(collectedTimesMs) });
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
    const routeDurationsMin = []; // timing-eligible full-route durations (first→last stop)
    let bulkExcludedRoutes = 0;
    const byArea = {
      downtown: { stops: 0, collections: 0, issuesAccess: 0, issuesNoBag: 0, issuesDelivery: 0, deltasMs: [] },
      uptown: { stops: 0, collections: 0, issuesAccess: 0, issuesNoBag: 0, issuesDelivery: 0, deltasMs: [] },
    };
    // Per (area, day-of-week): stop volume + how long the driver spent on that route.
    const byDay = {}; // "area|day" -> { area, day, routes, stops, durationsMin[], deltasMs[], bulkExcluded }

    for (const route of windowedRoutes) {
      const completed = route.entries; // already filtered to ones with time
      // Only count days/weeks that actually had recorded stops, so empty legacy
      // rows don't dilute the per-day / per-week averages.
      const routeEnd = completed.length ? completed[completed.length - 1].time : null;
      if (routeEnd) {
        daySet.add(etDate(routeEnd));
        weekSet.add(route.weekId);
      }
      // Timing is unreliable on bulk-confirmed routes; when clean=1, drop them
      // from pace + duration (but always keep their stop counts for volume).
      const timingOk = !(clean && route.bulkConfirmed);
      if (route.bulkConfirmed) bulkExcludedRoutes++;
      const dkey = `${route.area}|${route.day}`;
      if (!byDay[dkey]) byDay[dkey] = { area: route.area, day: route.day, routes: 0, stops: 0, durationsMin: [], deltasMs: [], bulkExcluded: 0 };

      const collections = completed.filter((e) => e.status === "collected").length;
      const issuesAccess = completed.filter((e) => e.status === "access_unavailable").length;
      const issuesNoBag = completed.filter((e) => e.status === "no_bag").length;
      const issuesDelivery = completed.filter((e) => e.status === "delivery_failed").length;

      // Per-stop segment gaps (drop same-batch <0.5m and break/gap >45m). These
      // feed the pace metric, which excludes bulk-confirmed routes when clean=1.
      const deltas = [];
      for (let i = 1; i < completed.length; i++) {
        const d = new Date(completed[i].time) - new Date(completed[i - 1].time);
        if (d >= GAP_FLOOR_MS && d <= GAP_CEILING_MS) {
          deltas.push(d);
          if (timingOk) {
            allDeltasMs.push(d);
            if (byArea[route.area]) byArea[route.area].deltasMs.push(d);
            byDay[dkey].deltasMs.push(d);
          }
        }
      }
      const avgDelta = deltas.length ? mean(deltas) : 0;

      // Total time on the route (first stop → last stop). The span reflects when
      // the driver started vs finished, so batch-marking doesn't invalidate it —
      // include every route, but drop implausible spans (bad timestamps).
      const spanMin =
        completed.length > 1
          ? (new Date(completed[completed.length - 1].time) - new Date(completed[0].time)) / 60000
          : null;
      const durationOk = spanMin != null && spanMin >= DURATION_FLOOR_MIN && spanMin <= DURATION_CEILING_MIN;
      if (durationOk) {
        routeDurationsMin.push(spanMin);
        byDay[dkey].durationsMin.push(spanMin);
      }
      if (clean && route.bulkConfirmed) byDay[dkey].bulkExcluded++;
      byDay[dkey].routes++;
      byDay[dkey].stops += completed.length;

      perRoute.push({
        weekId: route.weekId,
        area: route.area,
        day: route.day,
        completed: completed.length,
        collections,
        issuesAccess,
        issuesNoBag,
        issuesDelivery,
        bulkConfirmed: route.bulkConfirmed,
        avgMinutesPerStop: Math.round((avgDelta / 60000) * 10) / 10,
        totalDurationMinutes: spanMin != null ? Math.round(spanMin) : 0,
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

    // Average total route duration (timing-eligible routes) + per-day breakdown.
    const avgList = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const avgRouteDurationMin = routeDurationsMin.length ? Math.round(avgList(routeDurationsMin)) : 0;
    const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const byDayList = Object.values(byDay)
      .map((d) => ({
        area: d.area,
        day: d.day,
        routes: d.routes,
        avgStops: d.routes ? Math.round((d.stops / d.routes) * 10) / 10 : 0,
        avgDurationMin: d.durationsMin.length ? Math.round(avgList(d.durationsMin)) : null,
        avgMinutesPerStop: avgPerStopMinFrom(d.deltasMs),
        durationRoutes: d.durationsMin.length,
        bulkExcluded: d.bulkExcluded,
      }))
      .sort((a, b) => a.area.localeCompare(b.area) || DOW.indexOf(a.day) - DOW.indexOf(b.day));

    const overallPaceMin = avgPerStopMinFrom(allDeltasMs); // IQR-filtered mean, null if no data

    const numDays = daySet.size;
    const numWeeks = weekSet.size;
    const avgStopsPerDay = numDays ? Math.round((totalStops / numDays) * 10) / 10 : 0;
    const avgStopsPerWeek = numWeeks ? Math.round((totalStops / numWeeks) * 10) / 10 : 0;

    const areaSummary = {};
    for (const area of ["downtown", "uptown"]) {
      const a = byArea[area];
      areaSummary[area] = {
        totalStops: a.stops,
        totalCollections: a.collections,
        issuesAccess: a.issuesAccess,
        issuesNoBag: a.issuesNoBag,
        issuesDelivery: a.issuesDelivery,
        avgMinutesPerStop: avgPerStopMinFrom(a.deltasMs) ?? 0,
      };
    }

    // Sort perRoute by date descending so newest routes appear first
    perRoute.sort((a, b) =>
      (b.endTime || "").localeCompare(a.endTime || "")
    );

    // Phase 4 data-quality surface: same outlier detection the eta model uses.
    let dataQuality = null;
    try {
      const dqAreas = areaFilter === "all" ? ["downtown", "uptown"] : [areaFilter];
      const profiles = await Promise.all(dqAreas.map((a) => buildEtaProfile(a)));
      dataQuality = {
        cleanRoutes: profiles.reduce((s, p) => s + (p.dataQuality?.cleanRoutes || 0), 0),
        outlierRoutes: profiles.reduce((s, p) => s + (p.dataQuality?.outlierRoutes || 0), 0),
        totalRoutes: profiles.reduce((s, p) => s + (p.dataQuality?.totalRoutes || 0), 0),
        samples: profiles.reduce((s, p) => s + (p.dataQuality?.samples || 0), 0),
      };
    } catch {}

    return NextResponse.json({
      window: { days: windowDays, label: windowLabel(windowDays), numDays, numWeeks },
      area: areaFilter,
      clean,
      bulkExcludedRoutes, // routes flagged bulk-confirmed in this window
      summary: {
        totalRoutes: windowedRoutes.length,
        totalStops,
        totalCollections,
        totalIssuesAccess,
        totalIssuesNoBag,
        totalIssuesDelivery,
        avgMinutesPerStop: overallPaceMin ?? 0,
        avgRouteDurationMin,
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
      byDay: byDayList, // per pick-up / drop-off day: avg stops, avg total route duration, pace
      routes: perRoute,
      // Flat fields for the AnalyticsTab StatTiles
      totalStops,
      collectedCount: totalCollections,
      accessCount: totalIssuesAccess,
      noBagCount: totalIssuesNoBag,
      deliveryFailedCount: totalIssuesDelivery,
      avgPerStopMin: overallPaceMin ?? 0,
      avgRouteDurationMin,
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
    area: "all",
    clean: false,
    bulkExcludedRoutes: 0,
    byDay: [],
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
