// Live "driver is N min away" email alert system.
// Triggered by /api/driver/progress after each stop is marked. Recomputes
// per-stop ETAs from the learned model + the last completed mark, then
// fires one branded email per customer whose ETA is within the lead-time
// window. Each customer is alerted at most once per route (deduped via
// the ETA Alerts sheet tab).

import { google } from "googleapis";
import { sendEmail } from "./email.js";
import { buildEtaProfile } from "./eta-model.js";
import { distanceClass } from "./route-geo.js";
import {
  getCustomers,
  getPickupResponses,
  getCurrentWeekId,
  getOptOuts,
  getSetting,
  AREA_CONFIG,
} from "./sheets.js";
import {
  htmlShell,
  buildCallout,
  heroBlock,
  section,
} from "./email-templates.js";

function sheets() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets"],
  );
  return google.sheets({ version: "v4", auth });
}

async function ensureEtaAlertsTab() {
  const s = sheets();
  try {
    await s.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: "'ETA Alerts'!A1" });
    return;
  } catch {}
  try {
    await s.spreadsheets.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: "ETA Alerts" } } }] },
    });
    await s.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "'ETA Alerts'!A1:E1",
      valueInputOption: "RAW",
      requestBody: { values: [["Week ID", "Area", "Day", "Email", "Sent At"]] },
    });
  } catch {}
}

async function alreadyAlerted(weekId, area, day, email) {
  await ensureEtaAlertsTab();
  const s = sheets();
  try {
    const res = await s.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "'ETA Alerts'!A:E",
    });
    const rows = (res.data.values || []).slice(1);
    return rows.some(
      (r) =>
        r[0] === weekId &&
        r[1] === area &&
        (r[2] || "").toLowerCase() === (day || "").toLowerCase() &&
        (r[3] || "").toLowerCase() === (email || "").toLowerCase(),
    );
  } catch {
    return false;
  }
}

async function logAlert(weekId, area, day, email) {
  const s = sheets();
  await ensureEtaAlertsTab();
  await s.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "'ETA Alerts'!A1",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[weekId, area, day, email, new Date().toISOString()]] },
  });
}

function approachEmail({ etaWindowLabel }) {
  const subject = "Your pickup is coming up";
  const preheader = `Driver about ${etaWindowLabel} away. Make sure your bag is outside if it isn't already.`;
  const text = `Your pickup is coming up\n\nOur driver is about ${etaWindowLabel} away. Please have your bag outside if it isn't already.\n\n— The Laundry Day Team\n(646) 705-0600 · laundrydaynyc@gmail.com\n\nUnsubscribe: {{UNSUBSCRIBE_LINK}}`;
  const html = htmlShell(
    `
    ${section(`
      ${heroBlock({
        eyebrow: "Live update",
        title: `We're about ${etaWindowLabel} away`,
        sub: "Our driver is approaching your stop. Please make sure your bag is outside if it isn't already.",
      })}
    `, { paddingY: 32 })}
    ${section(buildCallout(
      `<strong>If your bag is already out</strong> — perfect, no action needed.`,
      { tone: "success", icon: "🚚" },
    ), { paddingY: 16 })}
    `,
    { preheader, title: subject },
  );
  return { subject, text, html };
}

// Recompute ETAs for the in-progress route, find pending stops whose ETA
// falls within the configured lead-time window, and fire an alert to each
// confirmed customer who hasn't already been alerted on this route.
//
// Inputs come from the live progress state; we re-derive everything from
// sheets to avoid trusting client-supplied data.
export async function fireApproachAlerts({ area, day, weekId }) {
  if (!AREA_CONFIG[area]) return { skipped: "invalid area" };
  const enabled = (await getSetting("eta_alerts_enabled", "false")) === "true";
  if (!enabled) return { skipped: "eta_alerts_enabled OFF" };
  const leadMin = parseInt(await getSetting("eta_alert_lead_min", "20"), 10) || 20;
  weekId = weekId || getCurrentWeekId();

  // Pull the full route as the driver-tracking endpoint would, but server-side.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pickup.laundryday.nyc";
  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) return { skipped: "ADMIN_PIN missing" };
  const trackRes = await fetch(
    `${baseUrl}/api/admin/driver-tracking?pin=${encodeURIComponent(adminPin)}&area=${encodeURIComponent(area)}&day=${encodeURIComponent(day)}&week=${encodeURIComponent(weekId)}`,
    { cache: "no-store" },
  );
  if (!trackRes.ok) return { skipped: `tracking ${trackRes.status}` };
  const tracking = await trackRes.json();
  const stops = tracking.stops || [];
  if (stops.length === 0) return { sent: 0 };

  const profile = await buildEtaProfile(area);
  const buffer = profile.buffer || 1.075;
  const segMin = (a, b) => {
    if (!a || !b) return 0;
    const cls = distanceClass(a, b);
    return (profile[cls] || 5) * buffer;
  };

  // Anchor on the last completed stop's actual time; else "now".
  let anchorMs = Date.now();
  let firstPendingIdx = 0;
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i].status !== "pending" && stops[i].statusTime) {
      const t = new Date(stops[i].statusTime).getTime();
      if (!isNaN(t)) { anchorMs = t; firstPendingIdx = i + 1; break; }
    }
  }
  if (firstPendingIdx >= stops.length) return { sent: 0, note: "route complete" };

  let cursor = anchorMs;
  const etaByStop = new Map();
  for (let i = 0; i < stops.length; i++) {
    if (i < firstPendingIdx) continue;
    if (i > firstPendingIdx) cursor += segMin(stops[i - 1], stops[i]) * 60000;
    etaByStop.set(stops[i].key, cursor);
  }

  // Map of email → customer + stop
  const [customers, responses, optOuts] = await Promise.all([
    getCustomers(area),
    getPickupResponses(area, weekId),
    getOptOuts(),
  ]);
  const config = AREA_CONFIG[area];

  // Pending stops whose ETA is within the window
  const now = Date.now();
  const window = leadMin * 60000;
  const due = stops.filter(
    (s) => s.status === "pending" && etaByStop.has(s.key) && etaByStop.get(s.key) - now <= window,
  );
  if (due.length === 0) return { sent: 0 };

  // Map address+unit → confirmed-customer emails for this route
  // (we already filter day1 vs day2 implicitly: any confirmed customer who
  // shows up on this route is eligible)
  let sent = 0;
  let skipped = 0;
  const results = [];
  for (const stop of due) {
    const matchingCustomer = customers.find(
      (c) =>
        c.address.toLowerCase().trim() === (stop.address || "").toLowerCase().trim() &&
        (c.unit || "").trim() === (stop.unit || "").trim(),
    );
    if (!matchingCustomer) continue;
    for (const email of matchingCustomer.emails) {
      const lower = email.toLowerCase().trim();
      if (optOuts.has(lower)) { skipped++; continue; }
      if (await alreadyAlerted(weekId, area, day, lower)) { skipped++; continue; }
      const minutesAway = Math.round((etaByStop.get(stop.key) - now) / 60000);
      const label = minutesAway <= 5 ? "5 minutes" : `${Math.max(5, minutesAway)} minutes`;
      const built = approachEmail({ etaWindowLabel: label, area });
      try {
        await sendEmail({
          to: email,
          subject: built.subject,
          text: built.text.replaceAll("{{UNSUBSCRIBE_LINK}}", `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}`),
          html: built.html.replaceAll("{{UNSUBSCRIBE_LINK}}", `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}`),
        });
        await logAlert(weekId, area, day, lower);
        sent++;
        results.push({ email: lower, stop: stop.address, minutesAway });
      } catch (e) {
        results.push({ email: lower, error: e.message });
      }
    }
  }

  return { sent, skipped, results };
}
