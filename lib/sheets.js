import { google } from "googleapis";
import { getSide, getCrossStreet, sortByRoute, is953Columbus } from "./route-geo.js";

function validateEnv() {
  const required = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_SHEET_ID"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}. Check your .env file.`);
  }
}

// Authenticate with Google Sheets using service account
function getAuth() {
  validateEnv();
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || "")
        .replace(/\\n/g, "\n")
        .replace(/\\u003d/g, "="),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

// Wrap the Google Sheets client so every read/write call gets transparent
// retry-with-exponential-backoff when the API rate-limits us. The default
// service-account quota is ~300 read req/min, which the driver-route +
// admin-dashboard + cron can briefly exceed when used concurrently. Without
// retry the user-facing surface is a raw "Quota exceeded" 500. With retry,
// the call sleeps 0.5s/1s/2s and almost always succeeds on the second try.
function isRetryableSheetsError(err) {
  const code = err?.code || err?.response?.status;
  if (code === 429 || code === 503) return true;
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("quota exceeded") || msg.includes("rate limit") || msg.includes("resource_exhausted");
}

function withRetry(fn, label) {
  return async (...args) => {
    const delays = [500, 1000, 2000]; // ms — total worst-case ~3.5s
    let lastErr;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await fn(...args);
      } catch (err) {
        lastErr = err;
        if (attempt === delays.length || !isRetryableSheetsError(err)) throw err;
        const wait = delays[attempt];
        console.warn(`Sheets ${label} hit quota/transient error (attempt ${attempt + 1}); retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastErr;
  };
}

function getSheets() {
  const auth = getAuth();
  const raw = google.sheets({ version: "v4", auth });
  // Wrap the methods we actually use. Untouched methods (e.g. spreadsheets.get
  // for metadata, batchUpdate for tab creation) pass through unchanged.
  const values = raw.spreadsheets.values;
  raw.spreadsheets.values = {
    ...values,
    get: withRetry(values.get.bind(values), "values.get"),
    batchGet: withRetry(values.batchGet.bind(values), "values.batchGet"),
    update: withRetry(values.update.bind(values), "values.update"),
    append: withRetry(values.append.bind(values), "values.append"),
    clear: withRetry(values.clear.bind(values), "values.clear"),
  };
  return raw;
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Tab name mapping for areas and their pickup days.
//
// day1     — pure pickup day for day1 customers
// day2     — combined day: drop off day1 customers' laundry + pick up day2 customers
// dropoffDay — pure dropoff day for the previous day2 pickups (no new pickups)
//
// Uptown:   pickup Fri/Sat → dropoff Mon (the laundry picked up Saturday is
//           returned Monday, which spans the ISO-week boundary)
// Downtown: pickup Tue/Thu → dropoff Fri (the laundry picked up Thursday is
//           returned Friday, same ISO week)
const AREA_CONFIG = {
  uptown: {
    customerTab: "Uptown Customers",
    day1: "Friday",
    day2: "Saturday",
    dropoffDay: "Monday",
  },
  downtown: {
    customerTab: "Downtown Customers",
    day1: "Tuesday",
    day2: "Thursday",
    dropoffDay: "Friday",
  },
};

// Read all customers from a given area tab
async function getCustomers(area) {
  const sheets = getSheets();
  const config = AREA_CONFIG[area];
  if (!config) throw new Error("Invalid area: " + area);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${config.customerTab}'!A1:F200`,
  });

  const rows = res.data.values || [];
  // Skip header row, parse customers
  const customers = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const address = (row[1] || "").trim();
    const unit = (row[2] || "").trim();
    const name = (row[3] || "").trim();
    const email = (row[4] || "").trim();
    const phone = (row[5] || "").trim();

    if (!address || !email) continue;

    // Some rows have multiple emails separated by commas
    const emails = email
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));

    customers.push({
      address,
      unit,
      name,
      emails,
      emailRaw: email,
      phone,
      rowIndex: i + 1,
    });
  }
  return customers;
}

// Add a new customer row to the area's customer tab.
// Columns: A=id (auto, blank), B=address, C=unit, D=name, E=email(s), F=phone
async function addCustomer(area, { address, unit = "", name = "", email = "", phone = "" }) {
  const sheets = getSheets();
  const config = AREA_CONFIG[area];
  if (!config) throw new Error("Invalid area: " + area);
  if (!address || !email) throw new Error("address and email are required");
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${config.customerTab}'!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: {
      values: [["", address.trim(), unit.trim(), name.trim(), email.trim(), phone.trim()]],
    },
  });
  return { ok: true };
}

// Update an existing customer row (by rowIndex returned from getCustomers).
async function updateCustomer(area, rowIndex, { address, unit, name, email, phone }) {
  const sheets = getSheets();
  const config = AREA_CONFIG[area];
  if (!config) throw new Error("Invalid area: " + area);
  if (!rowIndex || rowIndex < 2) throw new Error("Invalid rowIndex");
  // Read existing row first so we only update provided fields.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${config.customerTab}'!A${rowIndex}:F${rowIndex}`,
  });
  const existing = (res.data.values && res.data.values[0]) || ["", "", "", "", "", ""];
  const merged = [
    existing[0] || "",
    address ?? existing[1] ?? "",
    unit ?? existing[2] ?? "",
    name ?? existing[3] ?? "",
    email ?? existing[4] ?? "",
    phone ?? existing[5] ?? "",
  ].map((v) => (v == null ? "" : String(v).trim()));
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${config.customerTab}'!A${rowIndex}:F${rowIndex}`,
    valueInputOption: "RAW",
    resource: { values: [merged] },
  });
  return { ok: true };
}

// Soft opt-out — adds the customer's email(s) to the Opt-outs tab so they're
// filtered out of the cron's recipient list, without deleting the customer row.
async function setCustomerOptOut(email, source = "admin") {
  if (!email) throw new Error("email required");
  await addOptOut(email.trim(), source);
  return { ok: true };
}

// Read building access/key info from Keys tab
async function getKeys() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Keys'!A1:D200",
  });

  const rows = res.data.values || [];
  const keys = {};
  for (const row of rows) {
    const address = (row[0] || "").trim();
    const keyInfo = (row[1] || "").trim();
    const management = (row[2] || "").trim();
    const entryType = (row[3] || "").trim();

    if (!address) continue;
    keys[address.toLowerCase()] = {
      address,
      keyInfo,
      management,
      entryType,
    };
  }
  return keys;
}

// Get or create the Pickup Responses tab, returns current week's responses
async function getPickupResponses(area, weekId) {
  const sheets = getSheets();
  const tabName = "Pickup Responses";

  // Try to read existing responses
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:F`,
    });

    const rows = res.data.values || [];
    // Filter to current week and area
    return rows.filter((row) => row[0] === weekId && row[1] === area);
  } catch (e) {
    // Tab might not exist yet, create it
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [
            {
              addSheet: {
                properties: { title: tabName },
              },
            },
          ],
        },
      });
      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:F1`,
        valueInputOption: "RAW",
        resource: {
          values: [
            ["Week ID", "Area", "Email", "Day", "Timestamp", "Customer Name"],
          ],
        },
      });
    } catch (createErr) {
      // Tab might already exist but was empty
    }
    return [];
  }
}

// Log a pickup confirmation
async function logPickupConfirmation(
  area,
  weekId,
  email,
  day,
  customerName
) {
  const sheets = getSheets();
  const tabName = "Pickup Responses";
  const timestamp = new Date().toISOString();

  // Check if already confirmed this week
  const existing = await getPickupResponses(area, weekId);
  const existingRow = existing.find(
    (row) => row[2]?.toLowerCase() === email.toLowerCase()
  );

  if (existingRow) {
    const existingDay = existingRow[3] || "";
    if (existingDay.toLowerCase() === day.toLowerCase()) {
      return { status: "already_confirmed_same_day", existingDay };
    }
    return { status: "already_confirmed_different_day", existingDay };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${tabName}'!A1`,
    valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
    resource: {
      values: [[weekId, area, email, day, timestamp, customerName]],
    },
  });

  return { status: "confirmed" };
}

// Update an existing pickup confirmation to a new day (used when customer changes their mind)
async function updatePickupConfirmationDay(area, weekId, email, newDay) {
  const sheets = getSheets();
  const tabName = "Pickup Responses";
  const timestamp = new Date().toISOString();

  // Read the full Pickup Responses tab (with row numbers)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tabName}'!A:F`,
  });
  const rows = res.data.values || [];

  // Find the matching row (weekId + area + email), skip header
  let rowIndex = -1;
  let previousDay = "";
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (
      r[0] === weekId &&
      r[1] === area &&
      r[2]?.toLowerCase() === email.toLowerCase()
    ) {
      rowIndex = i + 1; // Sheets are 1-indexed
      previousDay = r[3] || "";
      break;
    }
  }

  if (rowIndex === -1) {
    // No existing row — create a new one instead
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [[weekId, area, email, newDay, timestamp, ""]] },
    });
    return { status: "confirmed", previousDay: "" };
  }

  // Update the day and timestamp columns (D and E)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${tabName}'!D${rowIndex}:E${rowIndex}`,
    valueInputOption: "RAW",
    resource: { values: [[newDay, timestamp]] },
  });

  return { status: "changed", previousDay };
}

// ISO week computation extracted so we can compute the week for ANY date
// (not just "now") — needed for dropoff-day routes where the source data
// lives in the previous ISO week.
function getWeekIdForDate(date) {
  const target = new Date(date.valueOf());
  const dayNum = (date.getDay() + 6) % 7; // Monday=0, Sunday=6
  target.setDate(target.getDate() - dayNum + 3);
  const jan4 = new Date(target.getFullYear(), 0, 4);
  const dayOfYear = (target - jan4) / 86400000;
  const weekNum = 1 + Math.round(dayOfYear / 7);
  return `${target.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// Get the current ISO week ID (e.g., "2026-W13")
function getCurrentWeekId() {
  return getWeekIdForDate(new Date());
}

// "Now" expressed as a Date whose getDay() reflects the current ET calendar day.
// Used for cross-week dropoff-day resolution.
function nowInET() {
  const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etStr);
}

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// For driver-facing routes, resolve which ISO week's data the request belongs to.
// • On day1/day2 → current week (where the new confirmations live).
// • On dropoffDay → the ISO week that CONTAINED the most recent past day2
//   (the actual pickup day whose laundry is being delivered today).
//   For uptown's Monday dropoff, this is the previous ISO week (Saturday W → Monday W+1).
//   For downtown's Friday dropoff, this is the same ISO week (Thursday W → Friday W).
function resolveWeekForDriverDay(area, day) {
  const config = AREA_CONFIG[area];
  if (!config) return getCurrentWeekId();
  const dayLc = (day || "").toLowerCase();
  if (dayLc !== (config.dropoffDay || "").toLowerCase()) {
    return getCurrentWeekId();
  }
  const targetIdx = WEEKDAYS.findIndex((d) => d.toLowerCase() === config.day2.toLowerCase());
  const et = nowInET();
  const todayIdx = et.getDay();
  let daysBack = (todayIdx - targetIdx + 7) % 7;
  if (daysBack === 0) daysBack = 7; // dropoffDay is never same calendar day as day2
  const past = new Date(et);
  past.setDate(past.getDate() - daysBack);
  return getWeekIdForDate(past);
}

// getSide + getCrossStreet now live in lib/route-geo.js (shared client/server).

// Build a customer entry with key lookup
function buildEntry(c, keysMap, type) {
  const keyLookup = c.address.toLowerCase().replace(/\s+/g, " ").trim();
  const keyInfo = keysMap[keyLookup] || {};

  let entryMethod = "";
  if (keyInfo.keyInfo && keyInfo.entryType) {
    entryMethod = `${keyInfo.entryType} - ${keyInfo.keyInfo}`;
  } else if (keyInfo.keyInfo) {
    entryMethod = keyInfo.keyInfo;
  } else if (keyInfo.entryType) {
    entryMethod = keyInfo.entryType;
  } else {
    entryMethod = "See notes";
  }

  return {
    address: c.address,
    unit: c.unit,
    name: c.name,
    entryMethod,
    phone: c.phone,
    type, // "pickup" or "dropoff"
  };
}

// Automatic entries for uptown Fri/Sat routes:
// - 214 West 102nd & 14 West 103rd: always walk-up pickups with keys (both days)
// - 953 Columbus Ave: always last drop-off (both days)
const UPTOWN_AUTO_PICKUPS = [
  { address: "214 West 102nd", unit: "", entryMethod: "Has a key", type: "pickup", isAuto: true },
  { address: "14 West 103rd", unit: "", entryMethod: "Has a key", type: "pickup", isAuto: true },
];
const UPTOWN_AUTO_DROPOFF_LAST = {
  address: "953 Columbus Ave", unit: "", entryMethod: "Has a key", type: "dropoff", isAuto: true,
};

function addUptownAutos(list) {
  // Add walk-up pickups (will be sorted into position by sortByRoute)
  for (const auto of UPTOWN_AUTO_PICKUPS) {
    const already = list.some(
      (x) => x.address.toLowerCase().replace(/\s+/g, " ") === auto.address.toLowerCase()
    );
    if (!already) list.push({ ...auto });
  }
  return list;
}

function append953Dropoff(list) {
  // Remove any existing 953 Columbus entry, then add it as the guaranteed last drop-off
  const filtered = list.filter((x) => !is953Columbus(x.address));
  filtered.push({ ...UPTOWN_AUTO_DROPOFF_LAST });
  return filtered;
}

// Permanent weekly cycle stops — appear on every route automatically.
// Pickup on the area's day1 (Tuesday/Friday); drop-off on the area's day2
// (Thursday/Saturday). To turn one into a both-days pickup like the existing
// 214 W 102 / 14 W 103 standing stops, move it into UPTOWN_AUTO_PICKUPS instead.
const PERMANENT_CYCLE_STOPS = {
  uptown: [
    { address: "1427 York Ave",  unit: "5C", entryMethod: "1185" },
    { address: "219 East 88th",  unit: "5A", entryMethod: "Master Key Silver" },
  ],
  downtown: [
    { address: "174 Thompson",   unit: "1RS", entryMethod: "Has a key" },
  ],
};

function addPermanentCycleStops(list, area, day) {
  const config = AREA_CONFIG[area];
  if (!config || !day) return list;
  const dayLc = day.toLowerCase();
  const isDay1 = dayLc === config.day1.toLowerCase();
  const isDay2 = dayLc === config.day2.toLowerCase();
  if (!isDay1 && !isDay2) return list;
  const type = isDay1 ? "pickup" : "dropoff";
  for (const s of PERMANENT_CYCLE_STOPS[area] || []) {
    const already = list.some(
      (x) =>
        (x.address || "").toLowerCase().replace(/\s+/g, " ").trim() ===
          s.address.toLowerCase() &&
        (x.unit || "").trim() === s.unit
    );
    if (!already) {
      list.push({
        address: s.address,
        unit: s.unit,
        entryMethod: s.entryMethod,
        type,
        isAuto: true,
        isPermanentCycle: true,
      });
    }
  }
  return list;
}

// Build the pickup list for a given day, sorted by driver route
function buildPickupList(confirmedCustomers, keysMap, area, type = "pickup", day = null) {
  let list = confirmedCustomers.map((c) => buildEntry(c, keysMap, type));
  if (area === "uptown") {
    list = addUptownAutos(list);
  }
  list = addPermanentCycleStops(list, area, day);
  sortByRoute(list, area || "uptown");
  if (area === "uptown") {
    list = append953Dropoff(list);
  }
  return list;
}

// Build a combined list (e.g., Saturday = Friday drop-offs + Saturday pickups)
function buildCombinedList(dropoffCustomers, pickupCustomers, keysMap, area, day = null) {
  const dropoffs = dropoffCustomers.map((c) => buildEntry(c, keysMap, "dropoff"));
  const pickups = pickupCustomers.map((c) => buildEntry(c, keysMap, "pickup"));
  let combined = [...dropoffs, ...pickups];
  if (area === "uptown") {
    combined = addUptownAutos(combined);
  }
  combined = addPermanentCycleStops(combined, area, day);
  sortByRoute(combined, area || "uptown");
  if (area === "uptown") {
    combined = append953Dropoff(combined);
  }
  return combined;
}

// ── Route Edits: persist manual additions/removals across refreshes ──

async function ensureRouteEditsTab() {
  const sheets = getSheets();
  const tabName = "Route Edits";
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:I`,
    });
  } catch (e) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:H1`,
        valueInputOption: "RAW",
        resource: {
          values: [["Week ID", "Area", "Day", "Action", "Address", "Unit", "Entry Method", "Type"]],
        },
      });
    } catch (createErr) {
      // Tab may already exist
    }
  }
}

async function getRouteEdits(area, weekId, day) {
  const sheets = getSheets();
  await ensureRouteEditsTab();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Route Edits'!A:I",
    });
    const rows = res.data.values || [];
    return rows.filter(
      (r) => r[0] === weekId && r[1] === area && r[2]?.toLowerCase() === day.toLowerCase()
    );
  } catch (e) {
    return [];
  }
}

async function saveRouteEdit(area, weekId, day, action, address, unit, entryMethod, type, source = "admin") {
  const sheets = getSheets();
  await ensureRouteEditsTab();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "'Route Edits'!A1",
    valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
    resource: {
      values: [[weekId, area, day, action, address, unit || "", entryMethod || "", type || "pickup", source]],
    },
  });
}

// Save an "add" route edit, and if it's a pickup on a known pickup day,
// automatically save a mirror "add" for the corresponding dropoff day.
// Two mirror rules:
//   • day1 pickup  → day2 dropoff      (Tue→Thu, Fri→Sat) — laundry returned next pickup day
//   • day2 pickup  → dropoffDay dropoff (Thu→Fri, Sat→Mon) — laundry returned on the dropoff-only day
// Mirror's source is suffixed with "-mirror" so the admin can see which stops
// were auto-created. applyRouteEdits dedups against existing list entries,
// so this is safe even if the customer is also in Pickup Responses for the
// originating day.
async function saveRouteAddWithMirror(area, weekId, day, address, unit, entryMethod, type, source = "admin") {
  const realType = type || "pickup";
  await saveRouteEdit(area, weekId, day, "add", address, unit, entryMethod, realType, source);
  const config = AREA_CONFIG[area];
  if (!config || realType !== "pickup") return;
  const dayLc = day.toLowerCase();
  if (dayLc === config.day1.toLowerCase()) {
    await saveRouteEdit(
      area, weekId, config.day2, "add", address, unit, entryMethod, "dropoff",
      `${source}-mirror`,
    );
  } else if (config.dropoffDay && dayLc === config.day2.toLowerCase()) {
    await saveRouteEdit(
      area, weekId, config.dropoffDay, "add", address, unit, entryMethod, "dropoff",
      `${source}-mirror`,
    );
  }
}

// Undo an "add" route edit, including any auto-created dropoff mirror.
// Always tries the mirror removal; it's a no-op if no mirror exists.
async function removeRouteAddWithMirror(area, weekId, day, address, unit) {
  await removeRouteEdit(area, weekId, day, "add", address, unit);
  const config = AREA_CONFIG[area];
  if (!config) return;
  const dayLc = day.toLowerCase();
  if (dayLc === config.day1.toLowerCase()) {
    await removeRouteEdit(area, weekId, config.day2, "add", address, unit);
  } else if (config.dropoffDay && dayLc === config.day2.toLowerCase()) {
    await removeRouteEdit(area, weekId, config.dropoffDay, "add", address, unit);
  }
}

async function removeRouteEdit(area, weekId, day, action, address, unit) {
  const sheets = getSheets();
  await ensureRouteEditsTab();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Route Edits'!A:I",
    });
    const rows = res.data.values || [];
    // Find the row index to delete (1-based, skip header)
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (
        r[0] === weekId &&
        r[1] === area &&
        r[2]?.toLowerCase() === day.toLowerCase() &&
        r[3] === action &&
        r[4]?.toLowerCase() === address.toLowerCase() &&
        (r[5] || "") === (unit || "")
      ) {
        // Clear this row
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `'Route Edits'!A${i + 1}:I${i + 1}`,
          valueInputOption: "RAW",
          resource: { values: [["", "", "", "", "", "", "", "", ""]] },
        });
        return true;
      }
    }
  } catch (e) {
    // ignore
  }
  return false;
}

// Apply saved route edits to a pickup list
function applyRouteEdits(list, edits, area) {
  // Apply removals
  const removals = edits.filter((e) => e[3] === "remove");
  let result = list.filter((item) => {
    return !removals.some(
      (r) =>
        r[4]?.toLowerCase() === item.address.toLowerCase() &&
        (r[5] || "") === (item.unit || "")
    );
  });

  // Apply additions
  const additions = edits.filter((e) => e[3] === "add");
  for (const add of additions) {
    const already = result.some(
      (x) =>
        x.address.toLowerCase() === (add[4] || "").toLowerCase() &&
        (x.unit || "") === (add[5] || "")
    );
    if (!already) {
      result.push({
        address: add[4] || "",
        unit: add[5] || "",
        entryMethod: add[6] || "See notes",
        type: add[7] || "pickup",
        isManual: true,
        addedBy: add[8] || "admin",
      });
    }
  }

  // Re-sort after applying edits
  sortByRoute(result, area);

  // If uptown, ensure 953 Columbus is last
  if (area === "uptown") {
    result = append953Dropoff(result);
  }

  return result;
}

// ── Route Order: persist user's manual reordering of the pickup list ──

async function ensureRouteOrderTab() {
  const sheets = getSheets();
  const tabName = "Route Order";
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:F`,
    });
  } catch (e) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:D1`,
        valueInputOption: "RAW",
        resource: {
          values: [["Week ID", "Area", "Day", "Order JSON"]],
        },
      });
    } catch (createErr) {
      // Tab may already exist
    }
  }
}

// Save the manual order as a JSON-encoded list of "address|unit" identifiers
async function saveRouteOrder(area, weekId, day, orderedKeys, source = "admin") {
  const sheets = getSheets();
  await ensureRouteOrderTab();
  const json = JSON.stringify(orderedKeys);
  const updatedAt = new Date().toISOString();

  // Look for an existing row to update
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Route Order'!A:F",
  });
  const rows = res.data.values || [];
  let foundRow = -1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === weekId && r[1] === area && r[2]?.toLowerCase() === day.toLowerCase()) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'Route Order'!A${foundRow}:F${foundRow}`,
      valueInputOption: "RAW",
      resource: { values: [[weekId, area, day, json, source, updatedAt]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "'Route Order'!A1",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [[weekId, area, day, json, source, updatedAt]] },
    });
  }
}

async function getRouteOrder(area, weekId, day) {
  const info = await getRouteOrderInfo(area, weekId, day);
  return info.order;
}

// Returns { order, source, updatedAt } — used by admin to show "last reordered by" indicator
async function getRouteOrderInfo(area, weekId, day) {
  const sheets = getSheets();
  await ensureRouteOrderTab();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Route Order'!A:F",
    });
    const rows = res.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r[0] === weekId && r[1] === area && r[2]?.toLowerCase() === day.toLowerCase()) {
        try {
          return {
            order: JSON.parse(r[3] || "[]"),
            source: r[4] || "admin",
            updatedAt: r[5] || null,
          };
        } catch {
          return { order: [], source: "admin", updatedAt: null };
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return { order: [], source: "admin", updatedAt: null };
}

// Reorder a pickup list to match a saved manual order.
// Items in the saved order appear in their saved positions (preserves driver's
// manual reordering for parking, traffic, etc). Items NOT in the saved order
// (late signups, new confirmations after the route was saved, manual admin/driver
// adds) are inserted at their natural geographic position via sortByRoute —
// they slot in between the driver's existing stops rather than dumping at the end.
function applyRouteOrder(list, savedOrder, area) {
  if (!savedOrder || savedOrder.length === 0) return list;

  const keyOf = (item) =>
    `${(item.address || "").toLowerCase().trim()}|${(item.unit || "").trim()}`;

  const orderMap = new Map();
  savedOrder.forEach((k, idx) => orderMap.set(k.toLowerCase(), idx));

  const inOrder = [];
  const notInOrder = [];
  for (const item of list) {
    const k = keyOf(item).toLowerCase();
    if (orderMap.has(k)) {
      inOrder.push({ item, pos: orderMap.get(k) });
    } else {
      notInOrder.push(item);
    }
  }
  inOrder.sort((a, b) => a.pos - b.pos);
  let result = inOrder.map((x) => x.item);

  if (notInOrder.length > 0) {
    // Compute the natural geographic order for the full set (existing + new)
    // so we can figure out where each new stop should slot in.
    const combined = [...result, ...notInOrder];
    sortByRoute(combined, area || "uptown");

    // For each new stop, insert it just before the next stop (in natural
    // order) that's already in the saved sequence. Walking forward through
    // `combined` from the new stop's position finds that geographic neighbor;
    // if there's no successor in the saved order (new stop falls at the
    // end of the natural route), append at the end.
    for (const newItem of notInOrder) {
      const sortedIdx = combined.indexOf(newItem);
      let insertAt = result.length;
      for (let i = sortedIdx + 1; i < combined.length; i++) {
        const successorIdx = result.indexOf(combined[i]);
        if (successorIdx !== -1) {
          insertAt = successorIdx;
          break;
        }
      }
      result.splice(insertAt, 0, newItem);
    }
  }

  // 953 Columbus always last for uptown
  if (area === "uptown") {
    result = append953Dropoff(result);
  }

  return result;
}

// ── Email Bounces: events received from Resend webhook ──

async function ensureBouncesTab() {
  const sheets = getSheets();
  const tabName = "Email Bounces";
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:F`,
    });
  } catch (e) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:F1`,
        valueInputOption: "RAW",
        resource: {
          values: [["Email", "Event Type", "Subject", "Timestamp", "Bounce Type", "Reason"]],
        },
      });
    } catch {}
  }
}

async function logBounceEvent({ email, eventType, subject, bounceType, reason }) {
  const sheets = getSheets();
  await ensureBouncesTab();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "'Email Bounces'!A1",
    valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
    resource: {
      values: [[
        (email || "").toLowerCase().trim(),
        eventType || "",
        subject || "",
        new Date().toISOString(),
        bounceType || "",
        reason || "",
      ]],
    },
  });
}

async function getRecentBounces(limit = 50) {
  const sheets = getSheets();
  await ensureBouncesTab();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Email Bounces'!A:F",
    });
    const rows = res.data.values || [];
    return rows.slice(1)
      .map((r) => ({
        email: r[0] || "",
        eventType: r[1] || "",
        subject: r[2] || "",
        timestamp: r[3] || "",
        bounceType: r[4] || "",
        reason: r[5] || "",
      }))
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ── Stale Customer Detection: customers who haven't confirmed in N weeks ──

// Returns customers in the given area who haven't confirmed any pickup in `weeks` weeks.
// Looks at ALL pickup responses (across all weeks), finds the most recent confirmation
// per customer email, and flags those with no recent activity.
async function getStaleCustomers(area, weeks = 8) {
  const sheets = getSheets();
  try {
    const [customers, allResponses] = await Promise.all([
      getCustomers(area),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: "'Pickup Responses'!A:F",
      }).then((r) => r.data.values || []),
    ]);

    // Build: email → most recent confirmation timestamp
    const lastSeen = new Map();
    for (let i = 1; i < allResponses.length; i++) {
      const row = allResponses[i];
      if (row[1] !== area) continue;
      const email = (row[2] || "").toLowerCase();
      const ts = row[4]; // timestamp column
      if (!email || !ts) continue;
      const tsMs = new Date(ts).getTime();
      if (isNaN(tsMs)) continue;
      if (!lastSeen.has(email) || lastSeen.get(email) < tsMs) {
        lastSeen.set(email, tsMs);
      }
    }

    const cutoffMs = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
    const stale = [];
    for (const c of customers) {
      // Find the most recent confirmation across any of this customer's emails
      let mostRecentMs = 0;
      for (const e of c.emails) {
        const ms = lastSeen.get(e.toLowerCase()) || 0;
        if (ms > mostRecentMs) mostRecentMs = ms;
      }
      if (mostRecentMs < cutoffMs) {
        stale.push({
          name: c.name,
          address: c.address,
          unit: c.unit,
          emails: c.emails,
          lastConfirmedMs: mostRecentMs || null,
          lastConfirmedDate: mostRecentMs ? new Date(mostRecentMs).toISOString() : "never",
        });
      }
    }
    return stale;
  } catch (e) {
    console.warn("Stale customer detection failed:", e.message);
    return [];
  }
}

// ── Opt-outs: customers who clicked "Unsubscribe" — filtered out of scheduled emails ──

async function ensureOptOutsTab() {
  const sheets = getSheets();
  const tabName = "Opt-outs";
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:C`,
    });
  } catch (e) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:C1`,
        valueInputOption: "RAW",
        resource: { values: [["Email", "Timestamp", "Source"]] },
      });
    } catch {}
  }
}

async function getOptOuts() {
  const sheets = getSheets();
  await ensureOptOutsTab();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Opt-outs'!A:C",
    });
    const rows = res.data.values || [];
    return new Set(rows.slice(1).map((r) => (r[0] || "").toLowerCase().trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function addOptOut(email, source = "self") {
  if (!email) return;
  const optOuts = await getOptOuts();
  if (optOuts.has(email.toLowerCase().trim())) return; // already opted out
  const sheets = getSheets();
  await ensureOptOutsTab();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "'Opt-outs'!A1",
    valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
    resource: {
      values: [[email.toLowerCase().trim(), new Date().toISOString(), source]],
    },
  });
}

// ── Settings: persisted key/value config used by the dashboard + cron ──

async function ensureSettingsTab() {
  const sheets = getSheets();
  const tabName = "Settings";
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:B`,
    });
  } catch (e) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:B1`,
        valueInputOption: "RAW",
        resource: { values: [["Key", "Value"]] },
      });
      // Default: scheduling OFF
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1`,
        valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
        resource: { values: [["email_scheduling_enabled", "false"]] },
      });
    } catch (createErr) {
      // Tab may already exist
    }
  }
}

async function getSetting(key, fallback = "") {
  const sheets = getSheets();
  await ensureSettingsTab();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Settings'!A1:B100",
    });
    const rows = res.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === key) return rows[i][1] ?? fallback;
    }
  } catch (e) {
    // ignore
  }
  return fallback;
}

async function setSetting(key, value) {
  const sheets = getSheets();
  await ensureSettingsTab();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Settings'!A1:B100",
  });
  const rows = res.data.values || [];
  let foundRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) {
      foundRow = i + 1;
      break;
    }
  }
  if (foundRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'Settings'!A${foundRow}:B${foundRow}`,
      valueInputOption: "RAW",
      resource: { values: [[key, String(value)]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "'Settings'!A1",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [[key, String(value)]] },
    });
  }
}

// ── Driver Progress: tracks which stop the driver is currently on for a given day/area ──

async function ensureDriverProgressTab() {
  const sheets = getSheets();
  const tabName = "Driver Progress";
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:E`,
    });
  } catch (e) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:E1`,
        valueInputOption: "RAW",
        resource: {
          values: [["Week ID", "Area", "Day", "Stop Statuses JSON", "Updated"]],
        },
      });
    } catch {}
  }
}

// Loud variant — throws on read failure so callers know NOT to write back
// a stale `{}`. Used by the safe merge path below.
async function getDriverProgressRaw(area, weekId, day) {
  const sheets = getSheets();
  await ensureDriverProgressTab();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Driver Progress'!A:E",
  });
  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === weekId && r[1] === area && r[2]?.toLowerCase() === day.toLowerCase()) {
      try {
        return { exists: true, rowIndex: i + 1, data: JSON.parse(r[3] || "{}") };
      } catch (e) {
        // Don't silently clobber — surface so caller can recover instead of wiping.
        throw new Error(`Driver Progress JSON parse failed for ${weekId} ${area} ${day}: ${e.message}`);
      }
    }
  }
  return { exists: false, rowIndex: -1, data: {} };
}

// Backwards-compatible: callers that already use this expect a plain object
// or `{}` on failure. The new merge-on-update path below uses getDriverProgressRaw
// directly so it can distinguish "no row" from "read failed".
async function getDriverProgress(area, weekId, day) {
  try {
    const { data } = await getDriverProgressRaw(area, weekId, day);
    return data;
  } catch {
    return {};
  }
}

// SAFE update: re-reads the latest progress row immediately before writing,
// MERGES the supplied keys into it, then writes the merged blob. This
// prevents the "stale-snapshot wipe" race that happened on W26 Thursday —
// where the handler read 6 keys, wrote 7 keys, and silently dropped the
// other 16 from a different concurrent session.
//
// `mutations` is a plain object of { [key]: { status, time } } that gets
// merged on top of whatever is currently on disk.
async function mergeDriverProgress(area, weekId, day, mutations) {
  const sheets = getSheets();
  await ensureDriverProgressTab();
  let raw;
  try {
    raw = await getDriverProgressRaw(area, weekId, day);
  } catch (e) {
    // Re-throw — better to surface a 500 to the driver UI than to wipe a
    // route by writing only the new mutations.
    throw new Error(`Refusing to write Driver Progress: ${e.message}`);
  }
  const merged = { ...raw.data, ...mutations };
  const json = JSON.stringify(merged);
  const updated = new Date().toISOString();
  if (raw.exists) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'Driver Progress'!A${raw.rowIndex}:E${raw.rowIndex}`,
      valueInputOption: "RAW",
      resource: { values: [[weekId, area, day, json, updated]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "'Driver Progress'!A1",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [[weekId, area, day, json, updated]] },
    });
  }
  return merged;
}

// Backwards-compatible whole-blob setter — used only by older callers and
// the test-mode reset path. New callers should use mergeDriverProgress.
async function setDriverProgress(area, weekId, day, statuses) {
  const sheets = getSheets();
  await ensureDriverProgressTab();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Driver Progress'!A:E",
  });
  const rows = res.data.values || [];
  const json = JSON.stringify(statuses);
  const updated = new Date().toISOString();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === weekId && r[1] === area && r[2]?.toLowerCase() === day.toLowerCase()) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'Driver Progress'!A${i + 1}:E${i + 1}`,
        valueInputOption: "RAW",
        resource: { values: [[weekId, area, day, json, updated]] },
      });
      return;
    }
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "'Driver Progress'!A1",
    valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
    resource: { values: [[weekId, area, day, json, updated]] },
  });
}

// ── Driver Issues: log of access-unavailable and bag-not-out events with photos ──

async function ensureIssuesTab() {
  const sheets = getSheets();
  const tabName = "Driver Issues";
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:I`,
    });
  } catch (e) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:I1`,
        valueInputOption: "RAW",
        resource: {
          values: [
            [
              "Week ID",
              "Area",
              "Day",
              "Issue Type",
              "Address",
              "Unit",
              "Tenant Email",
              "Timestamp",
              "Photo URL",
            ],
          ],
        },
      });
    } catch {}
  }
}

// ── Dropoff Photos: internal records, searchable by address ──

async function ensureDropoffsTab() {
  const sheets = getSheets();
  const tabName = "Dropoff Photos";
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A:F`,
    });
  } catch (e) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:F1`,
        valueInputOption: "RAW",
        resource: {
          values: [["Week ID", "Area", "Day", "Address", "Unit", "Photo URL"]],
        },
      });
    } catch {}
  }
}

async function logDropoffPhoto({ area, weekId, day, address, unit, photoUrl }) {
  const sheets = getSheets();
  await ensureDropoffsTab();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "'Dropoff Photos'!A1",
    valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
    resource: {
      values: [[weekId, area, day, address, unit || "", photoUrl || ""]],
    },
  });
}

// Pull all drop-off photos logged on a single route (area + week + day).
// Returned as a map keyed by "lowercaseAddress|unit" for fast joining onto
// the route stops in /api/admin/driver-tracking.
async function getDropoffsForRoute(area, weekId, day) {
  const sheets = getSheets();
  await ensureDropoffsTab();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Dropoff Photos'!A:F",
    });
    const rows = res.data.values || [];
    const norm = (s) => (s || "").toLowerCase().trim();
    const dayLower = (day || "").toLowerCase();
    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r[0] !== weekId) continue;
      if (r[1] !== area) continue;
      if ((r[2] || "").toLowerCase() !== dayLower) continue;
      const key = `${norm(r[3])}|${r[4] || ""}`;
      // Latest entry wins for the same key (newer photo overrides)
      map.set(key, { photoUrl: r[5] || "", day: r[2] });
    }
    return map;
  } catch {
    return new Map();
  }
}

// Look up dropoff photos for an address (for admin dispute resolution)
async function getDropoffPhotos(area, address, unit) {
  const sheets = getSheets();
  await ensureDropoffsTab();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'Dropoff Photos'!A:F",
    });
    const rows = res.data.values || [];
    const norm = (s) => (s || "").toLowerCase().trim();
    return rows.slice(1)
      .filter((r) => r[1] === area && norm(r[3]) === norm(address) && (r[4] || "") === (unit || ""))
      .map((r) => ({
        weekId: r[0], area: r[1], day: r[2], address: r[3], unit: r[4], photoUrl: r[5],
      }));
  } catch {
    return [];
  }
}

async function logDriverIssue({
  area,
  weekId,
  day,
  issueType,
  address,
  unit,
  tenantEmail,
  photoUrl,
}) {
  const sheets = getSheets();
  await ensureIssuesTab();
  const timestamp = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "'Driver Issues'!A1",
    valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
    resource: {
      values: [
        [
          weekId,
          area,
          day,
          issueType,
          address,
          unit || "",
          tenantEmail || "",
          timestamp,
          photoUrl || "",
        ],
      ],
    },
  });
  return { timestamp };
}

// Look up the customer (and primary email) for a given address + unit in an area
async function findCustomerByAddress(area, address, unit) {
  const customers = await getCustomers(area);
  const norm = (s) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");
  return customers.find(
    (c) => norm(c.address) === norm(address) && (c.unit || "").trim() === (unit || "").trim()
  );
}

export {
  getCustomers,
  addCustomer,
  updateCustomer,
  setCustomerOptOut,
  getKeys,
  getPickupResponses,
  logPickupConfirmation,
  updatePickupConfirmationDay,
  getCurrentWeekId,
  getWeekIdForDate,
  resolveWeekForDriverDay,
  buildPickupList,
  buildCombinedList,
  getRouteEdits,
  saveRouteEdit,
  removeRouteEdit,
  saveRouteAddWithMirror,
  removeRouteAddWithMirror,
  applyRouteEdits,
  saveRouteOrder,
  getRouteOrder,
  getRouteOrderInfo,
  applyRouteOrder,
  sortByRoute,
  getSetting,
  setSetting,
  getOptOuts,
  addOptOut,
  getStaleCustomers,
  logBounceEvent,
  getRecentBounces,
  getDriverProgress,
  setDriverProgress,
  mergeDriverProgress,
  logDriverIssue,
  logDropoffPhoto,
  getDropoffPhotos,
  getDropoffsForRoute,
  findCustomerByAddress,
  AREA_CONFIG,
};
