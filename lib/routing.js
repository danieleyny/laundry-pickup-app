// Routing provider — Mapbox by default. Geocoder + travel-time matrix
// behind a thin interface so Google could be swapped in later. All
// requests are Manhattan-scoped + validated; non-Manhattan results are
// flagged "needs_review" and never trusted by the optimizer.

import { google } from "googleapis";

// Manhattan bounding box (rough but tight enough to keep out boroughs).
const MANHATTAN_BBOX = { minLng: -74.02, minLat: 40.70, maxLng: -73.91, maxLat: 40.88 };
const MANHATTAN_PROXIMITY = [-73.98, 40.76]; // Midtown centroid
const MAPBOX_GEOCODE = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const MAPBOX_MATRIX = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving";

function token() {
  const t = process.env.MAPBOX_TOKEN;
  if (!t) throw new Error("MAPBOX_TOKEN not set");
  return t;
}

function inManhattan(lng, lat) {
  return (
    typeof lng === "number" && typeof lat === "number" &&
    lng >= MANHATTAN_BBOX.minLng && lng <= MANHATTAN_BBOX.maxLng &&
    lat >= MANHATTAN_BBOX.minLat && lat <= MANHATTAN_BBOX.maxLat
  );
}

function qualify(address) {
  return `${address.trim()}, Manhattan, New York, NY`.replace(/\s+/g, " ");
}

// Returns { lat, lng, placeName, status: "ok" | "needs_review", reason? }.
async function geocodeOne(address) {
  const url = new URL(`${MAPBOX_GEOCODE}/${encodeURIComponent(qualify(address))}.json`);
  url.searchParams.set("access_token", token());
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address,poi");
  url.searchParams.set("proximity", MANHATTAN_PROXIMITY.join(","));
  url.searchParams.set("bbox", `${MANHATTAN_BBOX.minLng},${MANHATTAN_BBOX.minLat},${MANHATTAN_BBOX.maxLng},${MANHATTAN_BBOX.maxLat}`);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Mapbox geocode ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const f = (json.features || [])[0];
  if (!f) return { lat: null, lng: null, placeName: "", status: "needs_review", reason: "no_results" };
  const [lng, lat] = f.center || [];
  if (!inManhattan(lng, lat)) {
    return { lat, lng, placeName: f.place_name || "", status: "needs_review", reason: "outside_manhattan" };
  }
  return { lat, lng, placeName: f.place_name || "", status: "ok" };
}

// ── Geocache (Google Sheet tab) ──────────────────────────────────────────
function sheetsClient(readonly = false) {
  const scope = readonly
    ? ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    : ["https://www.googleapis.com/auth/spreadsheets"];
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scope,
  );
  return google.sheets({ version: "v4", auth });
}

async function ensureGeocacheTab(sheets) {
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "'Geocache'!A1",
    });
    return;
  } catch {}
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: "Geocache" } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "'Geocache'!A1:E1",
      valueInputOption: "RAW",
      requestBody: { values: [["Address", "Lat", "Lng", "UpdatedAt", "Status"]] },
    });
  } catch {}
}

function normalizeKey(address) {
  return (address || "").toLowerCase().replace(/\s+/g, " ").trim();
}

async function readCache() {
  const sheets = sheetsClient(true);
  await ensureGeocacheTab(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "'Geocache'!A:E",
  });
  const rows = (res.data.values || []).slice(1);
  const map = new Map();
  for (const r of rows) {
    if (!r || !r[0]) continue;
    map.set(normalizeKey(r[0]), {
      address: r[0],
      lat: r[1] ? parseFloat(r[1]) : null,
      lng: r[2] ? parseFloat(r[2]) : null,
      updatedAt: r[3] || "",
      status: r[4] || "ok",
    });
  }
  return map;
}

async function writeCacheRow(address, entry) {
  const sheets = sheetsClient();
  await ensureGeocacheTab(sheets);
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "'Geocache'!A1",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        address,
        entry.lat ?? "",
        entry.lng ?? "",
        new Date().toISOString(),
        entry.status,
      ]],
    },
  });
}

// Geocode-with-cache. Looks up cached entries first; only calls Mapbox for
// new/unknown addresses. Status="needs_review" entries are re-checked so
// the admin can correct the address upstream and we then upgrade the cache.
export async function geocodeAddresses(addresses) {
  if (!addresses || addresses.length === 0) return {};
  const cache = await readCache();
  const out = {};
  const fresh = []; // [{address, key}]
  for (const a of addresses) {
    const key = normalizeKey(a);
    const hit = cache.get(key);
    if (hit && hit.status === "ok" && hit.lat != null && hit.lng != null) {
      out[a] = hit;
    } else {
      fresh.push({ address: a, key });
    }
  }
  // Concurrency-friendly: do up to 8 at a time
  for (let i = 0; i < fresh.length; i += 8) {
    const batch = fresh.slice(i, i + 8);
    await Promise.all(
      batch.map(async ({ address }) => {
        try {
          const r = await geocodeOne(address);
          out[address] = r;
          await writeCacheRow(address, r);
        } catch (e) {
          out[address] = { lat: null, lng: null, status: "needs_review", reason: e.message };
        }
      }),
    );
  }
  return out;
}

// Travel-time matrix between N coordinates. Mapbox caps at 25 per request,
// so we tile. Returns minutes[i][j].
export async function travelTimeMatrix(coords) {
  if (!coords || coords.length < 2) return [];
  const tile = 25; // Mapbox max
  const n = coords.length;
  const minutes = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let r = 0; r < n; r += tile) {
    for (let c = 0; c < n; c += tile) {
      const sourceIdx = [];
      const destIdx = [];
      const coordSet = new Map();
      const addCoord = (i) => {
        if (!coordSet.has(i)) coordSet.set(i, coordSet.size);
        return coordSet.get(i);
      };
      for (let i = r; i < Math.min(r + tile, n); i++) sourceIdx.push(addCoord(i));
      for (let j = c; j < Math.min(c + tile, n); j++) destIdx.push(addCoord(j));
      const ordered = [...coordSet.keys()].map((i) => coords[i]);
      const coordStr = ordered.map(([lng, lat]) => `${lng},${lat}`).join(";");
      const url = new URL(`${MAPBOX_MATRIX}/${coordStr}`);
      url.searchParams.set("access_token", token());
      url.searchParams.set("sources", sourceIdx.join(";"));
      url.searchParams.set("destinations", destIdx.join(";"));
      url.searchParams.set("annotations", "duration");
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Mapbox matrix ${res.status}: ${await res.text()}`);
      const json = await res.json();
      const durations = json.durations || [];
      // durations[srcIdxIdx][dstIdxIdx] in seconds
      const sources = [...coordSet.keys()].filter((i) => i >= r && i < r + tile);
      const dests = [...coordSet.keys()].filter((i) => i >= c && i < c + tile);
      for (let si = 0; si < sources.length; si++) {
        for (let di = 0; di < dests.length; di++) {
          const sec = durations[si]?.[di];
          if (typeof sec === "number") minutes[sources[si]][dests[di]] = sec / 60;
        }
      }
    }
  }
  return minutes;
}

// Find addresses in the geocache that need review (admin Customers tab will
// surface these so the admin can correct the source-of-truth Customer row).
export async function getAddressesNeedingReview() {
  const cache = await readCache();
  const out = [];
  for (const [k, v] of cache) {
    if (v.status === "needs_review") out.push({ key: k, ...v });
  }
  return out;
}
