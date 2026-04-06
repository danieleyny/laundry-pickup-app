import { google } from "googleapis";

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

function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Tab name mapping for areas and their pickup days
const AREA_CONFIG = {
  uptown: {
    customerTab: "Uptown Customers",
    day1: "Friday",
    day2: "Saturday",
  },
  downtown: {
    customerTab: "Downtown Customers",
    day1: "Tuesday",
    day2: "Thursday",
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
      range: `'${tabName}'!A1:F500`,
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
  const alreadyConfirmed = existing.some(
    (row) => row[2]?.toLowerCase() === email.toLowerCase()
  );

  if (alreadyConfirmed) {
    return { status: "already_confirmed" };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${tabName}'!A:F`,
    valueInputOption: "RAW",
    resource: {
      values: [[weekId, area, email, day, timestamp, customerName]],
    },
  });

  return { status: "confirmed" };
}

// Get the current ISO week ID (e.g., "2026-W13")
function getCurrentWeekId() {
  const now = new Date();
  // ISO week: week 1 is the week containing the first Thursday of the year
  const target = new Date(now.valueOf());
  // Set to nearest Thursday (current date + 4 - current day number, week starts Monday)
  const dayNum = (now.getDay() + 6) % 7; // Monday=0, Sunday=6
  target.setDate(target.getDate() - dayNum + 3);
  // January 4th is always in week 1
  const jan4 = new Date(target.getFullYear(), 0, 4);
  const dayOfYear = (target - jan4) / 86400000;
  const weekNum = 1 + Math.round(dayOfYear / 7);
  const paddedWeek = String(weekNum).padStart(2, "0");
  return `${target.getFullYear()}-W${paddedWeek}`;
}

// Determine if an address is on the East or West side
function getSide(address) {
  const a = address.toLowerCase();
  // Explicit East/West in address
  if (/\beast\b|\be\s+\d+/i.test(address)) return "east";
  if (/\bwest\b|\bw\s+\d+/i.test(address)) return "west";
  // East-side avenues
  if (/york|1st ave|first ave|2nd ave|3rd ave|lexington|park ave|madison|4th ave|ave\s*(a|b|c|d)\b/i.test(a)) return "east";
  // West-side avenues
  if (/columbus|amsterdam|broadway|central park|5th ave|6th ave|7th ave|8th ave|9th ave|10th ave|11th ave/i.test(a)) return "west";
  // Named streets — east side
  if (/clinton|suffolk|norfolk|essex|ludlow|orchard|allen|eldridge|forsyth|chrystie/i.test(a)) return "east";
  if (/mulberry|mott|elizabeth|bowery|lafayette|spring|prince|houston|st\s*marks/i.test(a)) return "east";
  // Named streets — west side
  if (/thompson|sullivan|macdougal|bleecker|hudson|greenwich|christopher/i.test(a)) return "west";
  return "unknown";
}

// Compute the cross-street number for an address using NYC geography
// For "East/West ##" addresses, extracts the street number directly.
// For named streets/avenues, uses the Manhattan Address Algorithm or known locations.
function getCrossStreet(address) {
  const a = address.trim();

  // "East/West ##" or "E/W ##" — extract directly
  const ewMatch = a.match(/(?:east|west|e|w)\s+(\d+)/i);
  if (ewMatch) return parseInt(ewMatch[1]);

  // Get building number (first number in address)
  const bldgMatch = a.match(/^(\d+)/);
  const bldg = bldgMatch ? parseInt(bldgMatch[1]) : 0;
  if (!bldg) return 0;

  const al = a.toLowerCase();

  // Manhattan Address Algorithm for named avenues
  // Formula: cancel last digit of building#, divide by 2, add key
  const truncated = Math.floor(bldg / 10);
  const half = truncated / 2;

  if (/\b(1st|first)\s*ave/i.test(al)) return Math.round(half + 3);
  if (/\b2nd\s*ave/i.test(al)) return Math.round(half + 3);
  if (/\b3rd\s*ave/i.test(al)) return Math.round(half + 10);
  if (/\byork\s*ave/i.test(al)) return Math.round(half + 4);
  if (/\b4th\s*ave/i.test(al)) return Math.round(half + 8);
  if (/\b5th\s*ave/i.test(al)) return Math.round(half + 13);
  if (/\b6th\s*ave/i.test(al)) return Math.round(half + 4); // works better for downtown 6th Ave
  if (/\b7th\s*ave/i.test(al)) return Math.round(half + 12);
  if (/\b8th\s*ave/i.test(al)) return Math.round(half + 10);
  if (/\b9th\s*ave/i.test(al)) return Math.round(half + 13);
  if (/\b10th\s*ave/i.test(al)) return Math.round(half + 14);
  if (/\bcolumbus/i.test(al)) return Math.round(half + 10);
  if (/\bamsterdam/i.test(al)) return Math.round(half + 10);
  if (/\bbroadway/i.test(al)) return bldg < 750 ? Math.round(half - 30) : Math.round(half - 25);

  // Avenue letter streets (east side, roughly Houston to 14th)
  if (/\bave(?:nue)?\s*(a|b|c|d)\b/i.test(al)) return Math.round(bldg / 20) + 1;

  // Named north-south streets — approximate by building number
  // Thompson St: Canal(~0) to W 3rd(~200), ~60 numbers per block
  if (/\bthompson/i.test(al)) return Math.max(0, Math.round(bldg / 60));
  if (/\bsullivan/i.test(al)) return Math.max(0, Math.round(bldg / 60));
  if (/\bmacdougal/i.test(al)) return Math.max(0, Math.round(bldg / 60));
  if (/\bmulberry/i.test(al)) return Math.max(0, Math.round(bldg / 55));
  if (/\bmott\b/i.test(al)) return Math.max(0, Math.round(bldg / 55));
  if (/\belizabeth\b/i.test(al)) return Math.max(0, Math.round(bldg / 55));
  if (/\bbowery/i.test(al)) return Math.max(0, Math.round(bldg / 40));
  if (/\blafayette/i.test(al)) return Math.max(0, Math.round(bldg / 40));
  if (/\bhudson/i.test(al)) return Math.max(0, Math.round(bldg / 30));
  if (/\bgreenwich/i.test(al)) return Math.max(0, Math.round(bldg / 30));
  if (/\bchristopher/i.test(al)) return 10;
  if (/\bbleecker/i.test(al)) return 8;
  if (/\bspring\b/i.test(al)) return 2;
  if (/\bprince\b/i.test(al)) return 3;
  if (/\bhouston/i.test(al)) return 1;
  if (/\bst\s*marks/i.test(al)) return 8; // St Marks Place = East 8th

  // Clinton St (LES): ~40 numbers per block from East Broadway north
  if (/\bclinton/i.test(al)) return Math.max(0, Math.round(bldg / 40));

  // Fallback: use building number (works for "East/West ##" already caught above)
  return bldg;
}

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

// Sort the list based on the driver's route
// Uptown (Fri/Sat): East side HIGH→LOW, then West side LOW→HIGH, 953 Columbus Ave always last
// Downtown (Tue/Thu): West side HIGH→LOW, then East side LOW→HIGH
function sortByRoute(list, area) {
  const is953Columbus = (addr) => /953\s*columbus/i.test(addr);

  list.sort((a, b) => {
    // 953 Columbus Ave always last (uptown)
    if (is953Columbus(a.address)) return 1;
    if (is953Columbus(b.address)) return -1;

    const aSide = getSide(a.address);
    const bSide = getSide(b.address);
    const aStreet = getCrossStreet(a.address);
    const bStreet = getCrossStreet(b.address);

    if (area === "uptown") {
      // Uptown route: East first (high→low), then West (low→high)
      if (aSide === "east" && bSide === "west") return -1;
      if (aSide === "west" && bSide === "east") return 1;
      if (aSide === "east" && bSide === "east") return bStreet - aStreet;
      if (aSide === "west" && bSide === "west") return aStreet - bStreet;
    } else {
      // Downtown route: West first (high→low), then East (low→high)
      if (aSide === "west" && bSide === "east") return -1;
      if (aSide === "east" && bSide === "west") return 1;
      if (aSide === "west" && bSide === "west") return bStreet - aStreet;
      if (aSide === "east" && bSide === "east") return aStreet - bStreet;
    }

    return aStreet - bStreet;
  });

  return list;
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
  const filtered = list.filter((x) => !/953\s*columbus/i.test(x.address));
  filtered.push({ ...UPTOWN_AUTO_DROPOFF_LAST });
  return filtered;
}

// Build the pickup list for a given day, sorted by driver route
function buildPickupList(confirmedCustomers, keysMap, area, type = "pickup") {
  let list = confirmedCustomers.map((c) => buildEntry(c, keysMap, type));
  if (area === "uptown") {
    list = addUptownAutos(list);
  }
  sortByRoute(list, area || "uptown");
  if (area === "uptown") {
    list = append953Dropoff(list);
  }
  return list;
}

// Build a combined list (e.g., Saturday = Friday drop-offs + Saturday pickups)
function buildCombinedList(dropoffCustomers, pickupCustomers, keysMap, area) {
  const dropoffs = dropoffCustomers.map((c) => buildEntry(c, keysMap, "dropoff"));
  const pickups = pickupCustomers.map((c) => buildEntry(c, keysMap, "pickup"));
  let combined = [...dropoffs, ...pickups];
  if (area === "uptown") {
    combined = addUptownAutos(combined);
  }
  sortByRoute(combined, area || "uptown");
  if (area === "uptown") {
    combined = append953Dropoff(combined);
  }
  return combined;
}

export {
  getCustomers,
  getKeys,
  getPickupResponses,
  logPickupConfirmation,
  getCurrentWeekId,
  buildPickupList,
  buildCombinedList,
  AREA_CONFIG,
};
