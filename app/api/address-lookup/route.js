import { NextResponse } from "next/server";
import { getCustomers, getKeys, AREA_CONFIG } from "../../../lib/sheets";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// GET /api/address-lookup?area=uptown&pin=1234
// Returns address, unit, and entry method data for autocomplete
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  const pin = searchParams.get("pin");

  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [customers, keysMap] = await Promise.all([
      getCustomers(area),
      getKeys(),
    ]);

    // Build address → units mapping
    const addressMap = {};
    for (const c of customers) {
      const addr = c.address;
      if (!addressMap[addr]) {
        addressMap[addr] = { units: new Set(), entryMethod: "" };
      }
      if (c.unit) addressMap[addr].units.add(c.unit);

      // Lookup entry method from keys
      const keyLookup = addr.toLowerCase().replace(/\s+/g, " ").trim();
      const keyInfo = keysMap[keyLookup];
      if (keyInfo) {
        let method = "";
        if (keyInfo.keyInfo && keyInfo.entryType) {
          method = `${keyInfo.entryType} - ${keyInfo.keyInfo}`;
        } else if (keyInfo.keyInfo) {
          method = keyInfo.keyInfo;
        } else if (keyInfo.entryType) {
          method = keyInfo.entryType;
        }
        if (method) addressMap[addr].entryMethod = method;
      }
    }

    // Also include addresses from keys that might not have customers
    for (const [key, val] of Object.entries(keysMap)) {
      const addr = val.address;
      if (!addressMap[addr]) {
        let method = "";
        if (val.keyInfo && val.entryType) {
          method = `${val.entryType} - ${val.keyInfo}`;
        } else if (val.keyInfo) {
          method = val.keyInfo;
        } else if (val.entryType) {
          method = val.entryType;
        }
        addressMap[addr] = { units: new Set(), entryMethod: method };
      }
    }

    // Convert sets to arrays for JSON
    const addresses = Object.entries(addressMap).map(([addr, data]) => ({
      address: addr,
      units: [...data.units].sort(),
      entryMethod: data.entryMethod,
    }));

    return NextResponse.json({ addresses });
  } catch (err) {
    console.error("Address lookup error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
