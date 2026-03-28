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

// Build the pickup list for a given day, sorted geographically
function buildPickupList(confirmedCustomers, keysMap) {
  const list = confirmedCustomers.map((c) => {
    // Look up building access info
    const keyLookup = c.address.toLowerCase().replace(/\s+/g, " ").trim();
    const keyInfo = keysMap[keyLookup] || {};

    // Build entry method description
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
    };
  });

  // Sort: East side first (low to high street number), then West side (low to high)
  list.sort((a, b) => {
    const aIsEast = /east|york|1st ave|2nd ave|3rd ave|lexington|park ave|madison/i.test(a.address);
    const bIsEast = /east|york|1st ave|2nd ave|3rd ave|lexington|park ave|madison/i.test(b.address);
    const aIsWest = /west|columbus|amsterdam|broadway|central park/i.test(a.address);
    const bIsWest = /west|columbus|amsterdam|broadway|central park/i.test(b.address);

    // East before West
    if (aIsEast && bIsWest) return -1;
    if (aIsWest && bIsEast) return 1;

    // Within same side, sort by street number
    const aNum = parseInt((a.address.match(/\d+/) || ["0"])[0]);
    const bNum = parseInt((b.address.match(/\d+/) || ["0"])[0]);

    // For addresses like "346 East 76th", extract the street number (76)
    const aStreet = parseInt((a.address.match(/(?:east|west)\s+(\d+)/i) || ["", "0"])[1]) || aNum;
    const bStreet = parseInt((b.address.match(/(?:east|west)\s+(\d+)/i) || ["", "0"])[1]) || bNum;

    if (aStreet !== bStreet) return aStreet - bStreet;
    return aNum - bNum;
  });

  return list;
}

export {
  getCustomers,
  getKeys,
  getPickupResponses,
  logPickupConfirmation,
  getCurrentWeekId,
  buildPickupList,
  AREA_CONFIG,
};
