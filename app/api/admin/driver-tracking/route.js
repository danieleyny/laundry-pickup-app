import { NextResponse } from "next/server";
import { google } from "googleapis";
import {
  getCustomers,
  getKeys,
  getPickupResponses,
  getCurrentWeekId,
  buildPickupList,
  buildCombinedList,
  getRouteEdits,
  applyRouteEdits,
  getRouteOrder,
  getRouteOrderInfo,
  applyRouteOrder,
  getDriverProgress,
  getDropoffsForRoute,
  AREA_CONFIG,
} from "../../../../lib/sheets";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// GET /api/admin/driver-tracking?pin=ADMIN_PIN&area=downtown[&day=Tuesday]
// Returns today's route + driver progress + any issue photos, for the admin live tracking view.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const area = searchParams.get("area") || "downtown";
  const config = AREA_CONFIG[area];
  if (!config) return NextResponse.json({ error: "Invalid area" }, { status: 400 });

  const dayParam = searchParams.get("day");
  const day = dayParam || resolveTodayOrDefault(config);
  // Optional ?week=2026-W21 override for historical lookups; defaults to current week.
  const week = searchParams.get("week") || getCurrentWeekId();

  try {
    const [customers, keysMap, responses, edits, orderInfo, progress, issues, dropoffs] =
      await Promise.all([
        getCustomers(area),
        getKeys(),
        getPickupResponses(area, week),
        getRouteEdits(area, week, day),
        getRouteOrderInfo(area, week, day),
        getDriverProgress(area, week, day),
        getIssuesForRoute(area, week, day),
        getDropoffsForRoute(area, week, day),
      ]);
    const savedOrder = orderInfo.order;

    const isDay2 = day.toLowerCase() === config.day2.toLowerCase();
    let pickupList;
    if (isDay2) {
      const day1Confirmed = responses
        .filter((r) => r[3]?.toLowerCase() === config.day1.toLowerCase())
        .map((r) => r[2]?.toLowerCase());
      const day2Confirmed = responses
        .filter((r) => r[3]?.toLowerCase() === config.day2.toLowerCase())
        .map((r) => r[2]?.toLowerCase());
      const day1Customers = customers.filter((c) =>
        c.emails.some((e) => day1Confirmed.includes(e.toLowerCase()))
      );
      const day2Customers = customers.filter((c) =>
        c.emails.some((e) => day2Confirmed.includes(e.toLowerCase()))
      );
      pickupList = buildCombinedList(day1Customers, day2Customers, keysMap, area, day);
    } else {
      const confirmedEmails = responses
        .filter((r) => r[3]?.toLowerCase() === day.toLowerCase())
        .map((r) => r[2]?.toLowerCase());
      const confirmedCustomers = customers.filter((c) =>
        c.emails.some((e) => confirmedEmails.includes(e.toLowerCase()))
      );
      pickupList = buildPickupList(confirmedCustomers, keysMap, area, "pickup", day);
    }

    pickupList = applyRouteEdits(pickupList, edits, area);
    pickupList = applyRouteOrder(pickupList, savedOrder, area);

    const keyOf = (s) =>
      `${(s.address || "").toLowerCase().trim()}|${(s.unit || "").trim()}`;

    const stops = pickupList.map((s) => {
      const k = keyOf(s);
      const issue = issues.find(
        (i) =>
          (i.address || "").toLowerCase().trim() === (s.address || "").toLowerCase().trim() &&
          (i.unit || "").trim() === (s.unit || "").trim()
      );
      const dropoff = dropoffs.get(k);
      return {
        ...s,
        key: k,
        status: progress[k]?.status || "pending",
        statusTime: progress[k]?.time || null,
        issueType: issue?.type || null,
        issueTime: issue?.time || null,
        photoUrl: issue?.photoUrl || null,
        tenantEmail: issue?.tenantEmail || null,
        dropoffPhotoUrl: dropoff?.photoUrl || null,
      };
    });

    const completedCount = stops.filter((s) => s.status !== "pending").length;
    const collectionCount = stops.filter((s) => s.status === "collected").length;
    const issueCount = stops.filter(
      (s) => s.status === "access_unavailable" || s.status === "no_bag"
    ).length;

    // Find current stop (first pending) for "driver is at" indicator
    const currentStopIdx = stops.findIndex((s) => s.status === "pending");

    return NextResponse.json({
      area,
      day,
      week,
      config,
      isCombined: isDay2,
      stops,
      completedCount,
      collectionCount,
      issueCount,
      totalCount: stops.length,
      currentStopIdx: currentStopIdx === -1 ? null : currentStopIdx,
      isAllDone: stops.length > 0 && completedCount === stops.length,
      orderInfo, // { order, source, updatedAt } — admin sees who last reordered
      driverAddedCount: stops.filter((s) => s.addedBy === "driver").length,
      lateSignupCount: stops.filter(
        (s) => s.addedBy === "late-signup" || s.addedBy === "late-signup-mirror"
      ).length,
    });
  } catch (err) {
    console.error("Admin tracking error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function resolveTodayOrDefault(config) {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false });
  const et = new Date(etStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayName = days[et.getDay()];
  if (todayName.toLowerCase() === config.day1.toLowerCase()) return config.day1;
  if (todayName.toLowerCase() === config.day2.toLowerCase()) return config.day2;
  return config.day1;
}

async function getIssuesForRoute(area, weekId, day) {
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
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "'Driver Issues'!A1:I500",
    });
    const rows = res.data.values || [];
    return rows.slice(1)
      .filter((r) => r[0] === weekId && r[1] === area && r[2]?.toLowerCase() === day.toLowerCase())
      .map((r) => ({
        weekId: r[0],
        area: r[1],
        day: r[2],
        type: r[3],
        address: r[4],
        unit: r[5] || "",
        tenantEmail: r[6] || "",
        time: r[7],
        photoUrl: r[8] || null,
      }));
  } catch {
    return [];
  }
}
