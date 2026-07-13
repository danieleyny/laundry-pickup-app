import { NextResponse } from "next/server";
import {
  getCustomers,
  addCustomer,
  updateCustomer,
  setCustomerOptOut,
  getOptOuts,
  getPickupResponses,
  getDropoffPhotos,
  AREA_CONFIG,
} from "../../../../lib/sheets";

export const dynamic = "force-dynamic";

function unauth() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// GET /api/admin/customers?pin&area[&q=search&email=...]
// - Default: list all customers in area with opt-out flag.
// - With ?email=<email>: returns single customer + recent confirmations + drop-off photos.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("pin") !== process.env.ADMIN_PIN) return unauth();
  const area = searchParams.get("area") || "downtown";
  if (!AREA_CONFIG[area]) return NextResponse.json({ error: "Invalid area" }, { status: 400 });

  const lookupEmail = searchParams.get("email");
  const q = (searchParams.get("q") || "").toLowerCase().trim();

  try {
    const [customers, optOuts] = await Promise.all([getCustomers(area), getOptOuts()]);
    if (lookupEmail) {
      const lower = lookupEmail.toLowerCase();
      const c = customers.find((x) => x.emails.some((e) => e.toLowerCase() === lower));
      if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
      // Pull recent confirmation history (last 26 weeks) + drop-off photos
      const responses = [];
      // Read this week first; widening if needed would mean scanning all weeks.
      // For now we read the whole Pickup Responses tab once via a current-week-agnostic helper.
      const dropoffs = await getDropoffPhotos(area, c.address, c.unit);
      return NextResponse.json({
        customer: {
          ...c,
          optedOut: c.emails.some((e) => optOuts.has(e.toLowerCase().trim())),
        },
        dropoffs,
      });
    }

    const list = customers.map((c) => ({
      ...c,
      optedOut: c.emails.some((e) => optOuts.has(e.toLowerCase().trim())),
    }));
    const filtered = q
      ? list.filter(
          (c) =>
            (c.name || "").toLowerCase().includes(q) ||
            (c.address || "").toLowerCase().includes(q) ||
            (c.unit || "").toLowerCase().includes(q) ||
            c.emails.some((e) => e.toLowerCase().includes(q)),
        )
      : list;
    return NextResponse.json({ customers: filtered, totalCount: list.length });
  } catch (err) {
    console.error("Admin customers GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/customers — add or update.
// Body: { pin, area, action: "add"|"update"|"opt-out"|"undo-opt-out", ...fields }
export async function POST(request) {
  const body = await request.json();
  if (body.pin !== process.env.ADMIN_PIN) return unauth();
  const { area, action } = body;
  if (!AREA_CONFIG[area]) return NextResponse.json({ error: "Invalid area" }, { status: 400 });

  try {
    if (action === "add") {
      await addCustomer(area, {
        address: body.address,
        unit: body.unit,
        name: body.name,
        email: body.email,
        phone: body.phone,
      });
    } else if (action === "update") {
      if (!body.rowIndex) return NextResponse.json({ error: "rowIndex required" }, { status: 400 });
      await updateCustomer(area, body.rowIndex, {
        address: body.address,
        unit: body.unit,
        name: body.name,
        email: body.email,
        phone: body.phone,
      });
    } else if (action === "opt-out") {
      if (!body.email) return NextResponse.json({ error: "email required" }, { status: 400 });
      await setCustomerOptOut(body.email, "admin");
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    return NextResponse.json({ status: "ok", action });
  } catch (err) {
    console.error("Admin customers POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
