import { NextResponse } from "next/server";
import {
  getCustomers,
  getKeys,
  getPickupResponses,
  getCurrentWeekId,
  buildPickupList,
  buildCombinedList,
  getRouteEdits,
  applyRouteEdits,
  saveRouteOrder,
  getSetting,
  AREA_CONFIG,
} from "../../../../lib/sheets";
import { is953Columbus, stopKey as keyOf } from "../../../../lib/route-geo";
import { geocodeAddresses, travelTimeMatrix } from "../../../../lib/routing";
import { getAreaForPin } from "../../../../lib/driver-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauth() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// POST /api/route/optimize { pin, area, day }
// Geocodes any new addresses, builds a Mapbox travel-time matrix, runs a
// nearest-neighbor seed + 2-opt swap pass, and saves the result as a
// "Route Order" entry with source="optimizer". The driver/admin will see
// the new order on the next refresh.
//
// Hard constraints honored:
//   - 953 Columbus stays last (uptown)
//   - Permanent stops + standing pickups remain (already in the list pre-optimize)
//   - Stops with status="needs_review" (bad geocode) get their heuristic position
//
// Gated by Settings flag `route_optimizer_enabled` — returns 503 if OFF
// so a stray button click can't burn Mapbox calls.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { pin, area, day } = body;

  const isAdmin = pin === process.env.ADMIN_PIN;
  const driverArea = getAreaForPin(pin);
  const allowedArea = isAdmin ? area : driverArea;
  if (!allowedArea) return unauth();
  if (allowedArea !== area) return unauth();
  if (!AREA_CONFIG[area]) return NextResponse.json({ error: "Invalid area" }, { status: 400 });
  if (!day) return NextResponse.json({ error: "day required" }, { status: 400 });

  const enabled = (await getSetting("route_optimizer_enabled", "false")) === "true";
  if (!enabled) {
    return NextResponse.json({ error: "Route optimizer is OFF in Settings" }, { status: 503 });
  }

  const t0 = Date.now();
  const config = AREA_CONFIG[area];
  const week = getCurrentWeekId();

  try {
    const [customers, keysMap, responses, edits] = await Promise.all([
      getCustomers(area),
      getKeys(),
      getPickupResponses(area, week),
      getRouteEdits(area, week, day),
    ]);

    const isDay2 = day.toLowerCase() === config.day2.toLowerCase();
    let stops;
    if (isDay2) {
      const day1c = responses.filter((r) => r[3]?.toLowerCase() === config.day1.toLowerCase()).map((r) => r[2]?.toLowerCase());
      const day2c = responses.filter((r) => r[3]?.toLowerCase() === config.day2.toLowerCase()).map((r) => r[2]?.toLowerCase());
      const day1Customers = customers.filter((c) => c.emails.some((e) => day1c.includes(e.toLowerCase())));
      const day2Customers = customers.filter((c) => c.emails.some((e) => day2c.includes(e.toLowerCase())));
      stops = buildCombinedList(day1Customers, day2Customers, keysMap, area, day);
    } else {
      const confirmed = responses.filter((r) => r[3]?.toLowerCase() === day.toLowerCase()).map((r) => r[2]?.toLowerCase());
      const confirmedCustomers = customers.filter((c) => c.emails.some((e) => confirmed.includes(e.toLowerCase())));
      stops = buildPickupList(confirmedCustomers, keysMap, area, "pickup", day);
    }
    stops = applyRouteEdits(stops, edits, area);

    // Hold out 953 Columbus — it'll be re-appended last for uptown.
    const last = area === "uptown" ? stops.find((s) => is953Columbus(s.address)) : null;
    const open = stops.filter((s) => !is953Columbus(s.address));

    // Geocode all unique addresses; flag bad ones as fallback positions
    const uniqueAddrs = [...new Set(open.map((s) => s.address))];
    const cache = await geocodeAddresses(uniqueAddrs);

    const optimizable = [];
    const fallbacks = []; // stops that couldn't be geocoded — heuristic position
    for (const s of open) {
      const g = cache[s.address];
      if (g && g.status === "ok" && g.lat != null && g.lng != null) optimizable.push({ ...s, lat: g.lat, lng: g.lng });
      else fallbacks.push({ ...s, _needsReview: true });
    }

    if (optimizable.length < 2) {
      // Nothing to optimize — preserve heuristic order
      const order = [...open, ...(last ? [last] : [])].map(keyOf);
      await saveRouteOrder(area, week, day, order, "optimizer");
      return NextResponse.json({ stops: stops.length, savedOrder: order.length, elapsedMs: Date.now() - t0, note: "Too few geocoded stops to optimize." });
    }

    const coords = optimizable.map((s) => [s.lng, s.lat]);
    const matrix = await travelTimeMatrix(coords);

    // Nearest-neighbor seed
    const n = optimizable.length;
    const visited = new Array(n).fill(false);
    const route = [0];
    visited[0] = true;
    while (route.length < n) {
      const last = route[route.length - 1];
      let best = -1;
      let bestTime = Infinity;
      for (let i = 0; i < n; i++) {
        if (visited[i]) continue;
        const t = matrix[last]?.[i];
        if (typeof t === "number" && t < bestTime) {
          bestTime = t;
          best = i;
        }
      }
      if (best === -1) {
        for (let i = 0; i < n; i++) if (!visited[i]) { best = i; break; }
      }
      route.push(best);
      visited[best] = true;
    }

    // 2-opt improvement
    const cost = (r) => {
      let c = 0;
      for (let i = 1; i < r.length; i++) c += matrix[r[i - 1]]?.[r[i]] ?? 0;
      return c;
    };
    let improved = true;
    let iter = 0;
    const MAX_ITER = 50;
    while (improved && iter++ < MAX_ITER) {
      improved = false;
      for (let i = 1; i < route.length - 2; i++) {
        for (let j = i + 1; j < route.length - 1; j++) {
          const a = route[i - 1], b = route[i], c = route[j], d = route[j + 1];
          const before = (matrix[a]?.[b] ?? 0) + (matrix[c]?.[d] ?? 0);
          const after = (matrix[a]?.[c] ?? 0) + (matrix[b]?.[d] ?? 0);
          if (after + 0.01 < before) {
            const sub = route.slice(i, j + 1).reverse();
            route.splice(i, sub.length, ...sub);
            improved = true;
          }
        }
      }
    }

    const orderedOptimizable = route.map((idx) => optimizable[idx]);
    const finalStops = [...orderedOptimizable, ...fallbacks, ...(last ? [last] : [])];
    const orderKeys = finalStops.map(keyOf);

    await saveRouteOrder(area, week, day, orderKeys, "optimizer");

    return NextResponse.json({
      stops: finalStops,
      savedOrder: orderKeys,
      optimized: orderedOptimizable.length,
      needsReview: fallbacks.length,
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    console.error("Route optimize error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
