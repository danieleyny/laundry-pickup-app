import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getCurrentWeekId, logPhoto, getPhotos } from "../../../lib/sheets";

// Driver photos: image bytes live in Vercel Blob, metadata lives in the
// "Photos" tab of the Google Sheet. Photos are kept for at least 30 days
// (see /api/photos/cleanup for the retention job).

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
const PHOTO_TYPES = ["pickup", "dropoff", "issue"];
const PHOTO_STATUSES = ["done", "no_bag", "issue"];

// Drivers use DRIVER_PIN (so they never need the admin PIN); the admin PIN works too
function pinOk(pin) {
  if (!pin) return false;
  if (process.env.ADMIN_PIN && pin === process.env.ADMIN_PIN) return true;
  if (process.env.DRIVER_PIN && pin === process.env.DRIVER_PIN) return true;
  return false;
}

function getRetentionDays() {
  const n = parseInt(process.env.PHOTO_RETENTION_DAYS || "", 10);
  // Business rule: photos must be kept for AT LEAST 30 days
  return isNaN(n) ? 30 : Math.max(30, n);
}

// GET /api/photos?area=uptown&day=Friday&week=2026-W28&address=214&pin=1234
// Lists photo records (newest first). week defaults to the current week; pass week=all for everything.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  if (!pinOk(pin)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const week = searchParams.get("week") || getCurrentWeekId();
  const area = searchParams.get("area") || undefined;
  const day = searchParams.get("day") || undefined;
  const address = searchParams.get("address") || undefined;

  try {
    const photos = await getPhotos({ week, area, day, address });
    return NextResponse.json({
      photos,
      week,
      day: day || null,
      area: area || null,
      retentionDays: getRetentionDays(),
    });
  } catch (err) {
    console.error("Photos list error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/photos — multipart/form-data upload from the driver
// Fields: pin, photo (file), address, area, type (pickup|dropoff|issue),
//         status (done|no_bag|issue), unit?, note?, day?, week?
export async function POST(request) {
  try {
    const form = await request.formData();

    const pin = form.get("pin");
    if (!pinOk(typeof pin === "string" ? pin : "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const file = form.get("photo");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Missing photo file" }, { status: 400 });
    }
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported image type: ${file.type || "unknown"}. Use JPEG, PNG, WebP, or HEIC.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: "Photo too large (max 8MB). Please use a smaller image." },
        { status: 400 }
      );
    }

    const address = (form.get("address") || "").toString().trim();
    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }
    const unit = (form.get("unit") || "").toString().trim();
    const note = (form.get("note") || "").toString().trim();
    const area = (form.get("area") || "uptown").toString();

    let type = (form.get("type") || "pickup").toString().toLowerCase();
    if (!PHOTO_TYPES.includes(type)) type = "pickup";
    let status = (form.get("status") || (type === "issue" ? "issue" : "done")).toString().toLowerCase();
    if (!PHOTO_STATUSES.includes(status)) status = "done";

    const week = (form.get("week") || getCurrentWeekId()).toString();
    // Default the day to today's NYC weekday name
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const day = (form.get("day") || dayNames[et.getDay()]).toString();

    const timestamp = new Date().toISOString();
    const datePart = timestamp.slice(0, 10);
    const slug = address.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const unitSlug = unit ? "-" + unit.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "";

    // addRandomSuffix makes the public URL unguessable
    const blob = await put(
      `driver-photos/${week}/${area}/${datePart}/${slug}${unitSlug}-${type}.${ext}`,
      file,
      { access: "public", addRandomSuffix: true, contentType: file.type }
    );

    await logPhoto({
      timestamp,
      week,
      area,
      day,
      address,
      unit,
      type,
      status,
      url: blob.url,
      pathname: blob.pathname,
      note,
    });

    return NextResponse.json({
      ok: true,
      url: blob.url,
      timestamp,
      week,
      area,
      day,
      address,
      unit,
      type,
      status,
      retentionDays: getRetentionDays(),
    });
  } catch (err) {
    console.error("Photo upload error:", err);
    const hint = /BLOB_READ_WRITE_TOKEN/i.test(err.message || "")
      ? " (Is the Vercel Blob store connected? BLOB_READ_WRITE_TOKEN must be set.)"
      : "";
    return NextResponse.json({ error: err.message + hint }, { status: 500 });
  }
}
