// Pure route-geometry module — NO googleapis import. Safe for client + server.
// Single source of truth for Manhattan address parsing, side/cross-street
// classification, route sorting, and the 953 Columbus / standing-stop rules.
//
// Used by:
//   - lib/sheets.js (server-side route building)
//   - app/dashboard/page.js (client-side reorder previews)
//   - app/driver/page.js (ETA segment classifier)
//   - lib/routing.js (Phase 3 optimizer, when active)

// ── Manhattan side (east / west / unknown) ───────────────────────────────
export function getSide(address) {
  if (!address) return "unknown";
  const a = address.toLowerCase();
  if (/\beast\b|\be\s+\d+/i.test(address)) return "east";
  if (/\bwest\b|\bw\s+\d+/i.test(address)) return "west";
  // East-side avenues
  if (/york|1st ave|first ave|2nd ave|3rd ave|lexington|park ave|madison|4th ave|ave\s*(a|b|c|d)\b/i.test(a)) return "east";
  // West-side avenues
  if (/columbus|amsterdam|broadway|central park|5th ave|6th ave|7th ave|8th ave|9th ave|10th ave|11th ave/i.test(a)) return "west";
  // Named streets — east side (LES + Bowery cluster)
  if (/clinton|suffolk|norfolk|essex|ludlow|orchard|allen|eldridge|forsyth|chrystie/i.test(a)) return "east";
  if (/mulberry|mott|elizabeth|bowery|lafayette|spring|prince|houston|st\s*marks/i.test(a)) return "east";
  // Named streets — west side (Village)
  if (/thompson|sullivan|macdougal|bleecker|hudson|greenwich|christopher/i.test(a)) return "west";
  return "unknown";
}

// ── Cross-street number (Manhattan Address Algorithm) ────────────────────
// Returns the approximate cross-street that the building sits on.
export function getCrossStreet(address) {
  if (!address) return 0;
  const a = address.trim();

  // "East/West ##" or "E/W ##" — extract directly
  const ewMatch = a.match(/(?:east|west|e|w)\s+(\d+)/i);
  if (ewMatch) return parseInt(ewMatch[1], 10);

  const bldgMatch = a.match(/^(\d+)/);
  const bldg = bldgMatch ? parseInt(bldgMatch[1], 10) : 0;
  if (!bldg) return 0;

  const al = a.toLowerCase();
  const truncated = Math.floor(bldg / 10);
  const half = truncated / 2;

  if (/\b(1st|first)\s*ave/i.test(al)) return Math.round(half + 3);
  if (/\b2nd\s*ave/i.test(al)) return Math.round(half + 3);
  if (/\b3rd\s*ave/i.test(al)) return Math.round(half + 10);
  if (/\byork\s*ave/i.test(al)) return Math.round(half + 4);
  if (/\b4th\s*ave/i.test(al)) return Math.round(half + 8);
  if (/\b5th\s*ave/i.test(al)) return Math.round(half + 13);
  if (/\b6th\s*ave/i.test(al)) return Math.round(half + 4);
  if (/\b7th\s*ave/i.test(al)) return Math.round(half + 12);
  if (/\b8th\s*ave/i.test(al)) return Math.round(half + 10);
  if (/\b9th\s*ave/i.test(al)) return Math.round(half + 13);
  if (/\b10th\s*ave/i.test(al)) return Math.round(half + 14);
  if (/\bcolumbus/i.test(al)) return Math.round(half + 10);
  if (/\bamsterdam/i.test(al)) return Math.round(half + 10);
  if (/\bbroadway/i.test(al)) return bldg < 750 ? Math.round(half - 30) : Math.round(half - 25);

  // Avenue letter streets (Alphabet City)
  if (/\bave(?:nue)?\s*(a|b|c|d)\b/i.test(al)) return Math.round(bldg / 20) + 1;

  // Village / SoHo / LES named streets
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
  if (/\bst\s*marks/i.test(al)) return 8;

  if (/\bclinton/i.test(al)) return Math.max(0, Math.round(bldg / 40));

  return bldg;
}

// ── Standing-stop predicates ─────────────────────────────────────────────
export function is953Columbus(addr) {
  return /953\s*columbus/i.test(addr || "");
}

// ── Route sort ────────────────────────────────────────────────────────────
// Uptown: East side HIGH→LOW, then West LOW→HIGH, 953 Columbus last
// Downtown: West side HIGH→LOW, then East LOW→HIGH
// Mutates list in place AND returns it.
export function sortByRoute(list, area) {
  list.sort((a, b) => {
    if (is953Columbus(a.address)) return 1;
    if (is953Columbus(b.address)) return -1;

    const aSide = getSide(a.address);
    const bSide = getSide(b.address);
    const aStreet = getCrossStreet(a.address);
    const bStreet = getCrossStreet(b.address);

    if (area === "uptown") {
      if (aSide === "east" && bSide === "west") return -1;
      if (aSide === "west" && bSide === "east") return 1;
      if (aSide === "east" && bSide === "east") return bStreet - aStreet;
      if (aSide === "west" && bSide === "west") return aStreet - bStreet;
    } else {
      if (aSide === "west" && bSide === "east") return -1;
      if (aSide === "east" && bSide === "west") return 1;
      if (aSide === "west" && bSide === "west") return bStreet - aStreet;
      if (aSide === "east" && bSide === "east") return aStreet - bStreet;
    }
    return aStreet - bStreet;
  });
  return list;
}

// ── Canonical stop key (used by route order + edits + progress) ──────────
export function stopKey(item) {
  return `${(item.address || "").toLowerCase().trim()}|${(item.unit || "").trim()}`;
}

// ── Distance class (used by ETA model + driver display) ──────────────────
export function distanceClass(a, b) {
  if (!a || !b) return "same";
  const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (norm(a.address) === norm(b.address)) return "same_building";
  const aSide = getSide(a.address);
  const bSide = getSide(b.address);
  if (aSide !== bSide && aSide !== "unknown" && bSide !== "unknown") return "cross_park";
  const aCross = getCrossStreet(a.address);
  const bCross = getCrossStreet(b.address);
  const diff = Math.abs(aCross - bCross);
  if (diff > 15) return "same_side_far";
  return "same_side_near";
}
