// Learn real per-segment travel times from Driver Progress history.
// Returns a small JSON profile the driver page uses to replace its
// hardcoded constants.
//
// Outputs (per area):
//   { same_building, same_side_near, same_side_far, cross_park, lead_min,
//     buffer, dataQuality: { cleanRoutes, totalRoutes, outlierRoutes, samples } }
//
// Falls back to the calibrated constants (the May 23 baseline) when
// there's not enough clean data yet — never produces a worse estimate.
//
// Outlier detection (per spec):
//   1) Bulk-confirm detection: if ≥3 stops in a route are timestamped within
//      a 60-second window, the entire route is flagged unreliable.
//   2) Implausible gaps: drop individual segments <0.5 min or >45 min.
//   3) IQR filter: drop segments outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR] per class.
//   4) Minimum sample size: require ≥4 clean samples per class to trust it.

import { google } from "googleapis";
import { distanceClass } from "./route-geo.js";
import { getPickupResponses, getCurrentWeekId, AREA_CONFIG } from "./sheets.js";

const FALLBACK = {
  same_building: 1.5,
  same_side_near: 5,
  same_side_far: 7,
  cross_park: 11,
  lead_min: 4,
  buffer: 1.075,
};

const MIN_SAMPLES_PER_CLASS = 4;
const BULK_WINDOW_SEC = 60;
const BULK_THRESHOLD = 3;
const GAP_FLOOR_MIN = 0.5;
const GAP_CEILING_MIN = 45;

function sheetsClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  );
  return google.sheets({ version: "v4", auth });
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return null;
  if (n % 2) return s[(n - 1) / 2];
  return (s[n / 2 - 1] + s[n / 2]) / 2;
}

function iqr(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  if (n < 4) return { q1: s[0], q3: s[n - 1] };
  const q1 = s[Math.floor((n - 1) * 0.25)];
  const q3 = s[Math.floor((n - 1) * 0.75)];
  return { q1, q3 };
}

function filterIqr(arr) {
  if (arr.length < 4) return arr;
  const { q1, q3 } = iqr(arr);
  const range = q3 - q1;
  const lo = q1 - 1.5 * range;
  const hi = q3 + 1.5 * range;
  return arr.filter((v) => v >= lo && v <= hi);
}

// Detects if a route has a cluster of >=BULK_THRESHOLD marks within
// BULK_WINDOW_SEC. If so, the whole route is excluded from timing.
function isBulkConfirmed(timesMs) {
  if (timesMs.length < BULK_THRESHOLD) return false;
  const sorted = [...timesMs].sort((a, b) => a - b);
  for (let i = 0; i <= sorted.length - BULK_THRESHOLD; i++) {
    if (sorted[i + BULK_THRESHOLD - 1] - sorted[i] <= BULK_WINDOW_SEC * 1000) {
      return true;
    }
  }
  return false;
}

// Pull Driver Progress rows for one area, join each route's marks with the
// route order it was driven in, classify each consecutive pair, and return
// a profile per the spec.
export async function buildEtaProfile(area) {
  if (!AREA_CONFIG[area]) throw new Error("Invalid area");

  let progRows = [];
  let orderRows = [];
  try {
    const sheets = sheetsClient();
    const [progRes, orderRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "'Driver Progress'!A:E",
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "'Route Order'!A:F",
      }),
    ]);
    progRows = (progRes.data.values || []).slice(1);
    orderRows = (orderRes.data.values || []).slice(1);
  } catch {
    return { ...FALLBACK, dataQuality: { cleanRoutes: 0, totalRoutes: 0, outlierRoutes: 0, samples: 0, source: "fallback" } };
  }

  // Build per (week, area, day) → ordered key list
  const orderMap = new Map();
  for (const r of orderRows) {
    if (!r || r.length < 4) continue;
    if (r[1] !== area) continue;
    const k = `${r[0]}|${(r[2] || "").toLowerCase()}`;
    try {
      orderMap.set(k, JSON.parse(r[3] || "[]"));
    } catch {}
  }

  // Per segment class: gather durations (in minutes)
  const classSamples = {
    same_building: [],
    same_side_near: [],
    same_side_far: [],
    cross_park: [],
  };
  let totalRoutes = 0;
  let cleanRoutes = 0;
  let outlierRoutes = 0;

  for (const r of progRows) {
    if (!r || r.length < 4) continue;
    if (r[1] !== area) continue;
    let progress;
    try { progress = JSON.parse(r[3] || "{}"); } catch { continue; }
    const marks = Object.entries(progress)
      .filter(([_, v]) => v && v.time && v.status === "collected")
      .map(([key, v]) => ({
        key,
        ms: new Date(v.time).getTime(),
      }))
      .filter((m) => !isNaN(m.ms))
      .sort((a, b) => a.ms - b.ms);
    if (marks.length < 2) continue;
    totalRoutes++;

    if (isBulkConfirmed(marks.map((m) => m.ms))) {
      outlierRoutes++;
      continue;
    }

    cleanRoutes++;
    // Use saved order if present; otherwise use the time-sorted order
    const orderKey = `${r[0]}|${(r[2] || "").toLowerCase()}`;
    const savedOrder = orderMap.get(orderKey);
    let ordered = marks;
    if (savedOrder && savedOrder.length) {
      const pos = new Map(savedOrder.map((k, i) => [k.toLowerCase(), i]));
      const inOrder = marks
        .filter((m) => pos.has(m.key.toLowerCase()))
        .sort((a, b) => pos.get(a.key.toLowerCase()) - pos.get(b.key.toLowerCase()));
      if (inOrder.length >= 2) ordered = inOrder;
    }

    for (let i = 1; i < ordered.length; i++) {
      const gapMin = (ordered[i].ms - ordered[i - 1].ms) / 60000;
      if (gapMin < GAP_FLOOR_MIN || gapMin > GAP_CEILING_MIN) continue;
      const [aAddr, aUnit] = ordered[i - 1].key.split("|");
      const [bAddr, bUnit] = ordered[i].key.split("|");
      const cls = distanceClass({ address: aAddr, unit: aUnit }, { address: bAddr, unit: bUnit });
      if (classSamples[cls]) classSamples[cls].push(gapMin);
    }
  }

  // Apply IQR filter + take median per class
  const learned = {};
  let totalSamples = 0;
  for (const cls of Object.keys(classSamples)) {
    const filtered = filterIqr(classSamples[cls]);
    totalSamples += filtered.length;
    if (filtered.length >= MIN_SAMPLES_PER_CLASS) {
      learned[cls] = +median(filtered).toFixed(2);
    } else {
      learned[cls] = FALLBACK[cls];
    }
  }

  return {
    same_building: learned.same_building,
    same_side_near: learned.same_side_near,
    same_side_far: learned.same_side_far,
    cross_park: learned.cross_park,
    lead_min: FALLBACK.lead_min,
    buffer: FALLBACK.buffer,
    dataQuality: {
      cleanRoutes,
      totalRoutes,
      outlierRoutes,
      samples: totalSamples,
      source: cleanRoutes > 0 ? "learned" : "fallback",
    },
  };
}
