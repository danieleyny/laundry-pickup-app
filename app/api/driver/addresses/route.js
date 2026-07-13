import { NextResponse } from "next/server";
import { getCustomers, getKeys } from "../../../../lib/sheets";
import { getAreaForPin } from "../../../../lib/driver-auth";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

// GET /api/driver/addresses?pin=1234
// Returns the address/unit/entry-method autocomplete data for the driver's area.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  const area = getAreaForPin(pin);
  if (!area) return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });

  try {
    const [customers, keysMap] = await Promise.all([getCustomers(area), getKeys()]);

    // Build address → {units, entryMethod}
    const byAddress = new Map();
    for (const c of customers) {
      const addr = c.address;
      if (!byAddress.has(addr.toLowerCase())) {
        byAddress.set(addr.toLowerCase(), { address: addr, units: new Set(), entryMethod: "" });
      }
      const entry = byAddress.get(addr.toLowerCase());
      if (c.unit) entry.units.add(c.unit);
    }
    // Fill entry methods from Keys tab
    for (const [k, entry] of byAddress.entries()) {
      const key = keysMap[k];
      if (key) {
        if (key.keyInfo && key.entryType) entry.entryMethod = `${key.entryType} - ${key.keyInfo}`;
        else if (key.keyInfo) entry.entryMethod = key.keyInfo;
        else if (key.entryType) entry.entryMethod = key.entryType;
      }
    }
    // Also pull pure key-only addresses (buildings with no confirmed customers yet)
    for (const k of Object.keys(keysMap)) {
      if (!byAddress.has(k)) {
        const key = keysMap[k];
        let em = "";
        if (key.keyInfo && key.entryType) em = `${key.entryType} - ${key.keyInfo}`;
        else if (key.keyInfo) em = key.keyInfo;
        else if (key.entryType) em = key.entryType;
        byAddress.set(k, { address: key.address, units: new Set(), entryMethod: em });
      }
    }

    const addresses = Array.from(byAddress.values()).map((e) => ({
      address: e.address,
      units: Array.from(e.units).sort(),
      entryMethod: e.entryMethod,
    }));

    return NextResponse.json({ area, addresses });
  } catch (err) {
    console.error("Driver address-lookup error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
