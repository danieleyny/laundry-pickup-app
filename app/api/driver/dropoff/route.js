import { NextResponse } from "next/server";
import {
  resolveWeekForDriverDay,
  mergeDriverProgress,
  logDropoffPhoto,
  getSetting,
} from "../../../../lib/sheets";
import { getAreaForPin } from "../../../../lib/driver-auth";
import { uploadPhoto } from "../../../../lib/cloudinary";

// Force dynamic rendering
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/driver/dropoff — multipart form
//   fields: pin, day, address, unit
//   file:   photo
// Records dropoff photo + marks stop as collected. No tenant email (internal record only).
export async function POST(request) {
  const form = await request.formData();
  const pin = form.get("pin");
  const day = form.get("day");
  const address = form.get("address");
  const unit = form.get("unit") || "";
  const photoFile = form.get("photo");

  const area = getAreaForPin(pin);
  if (!area) return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  if (!day || !address) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!photoFile || typeof photoFile.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Photo required" }, { status: 400 });
  }

  // For dropoff-day routes (uptown Mon, downtown Fri), the photo + progress
  // need to be filed under the week of the original pickup, not "today's" week.
  const week = resolveWeekForDriverDay(area, day);

  // Test mode: skip photo upload + sheet writes, return a stub success.
  // The driver UI still gets a 200 + photoUrl, so the flow looks identical,
  // but Cloudinary/Sheets are untouched and a reload restores pending state.
  const testMode = (await getSetting("test_mode_enabled", "false")) === "true";
  if (testMode) {
    return NextResponse.json({
      ok: true,
      testMode: true,
      photoUrl: "https://placehold.co/600x400?text=Test+Mode+(photo+discarded)",
    });
  }

  try {
    // 1. Upload photo to Cloudinary "Dropoffs" folder
    const buffer = Buffer.from(await photoFile.arrayBuffer());
    const safeAddr = String(address).replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
    const safeUnit = String(unit).replace(/[^a-zA-Z0-9]+/g, "-") || "noUnit";
    const ts = Date.now();
    const filename = `${safeAddr}__${safeUnit}__dropoff__${ts}.jpg`;
    const subfolder = `Dropoffs/${week}/${day}`;
    const photo = await uploadPhoto({
      buffer,
      mimeType: photoFile.type || "image/jpeg",
      filename,
      subfolder,
    });

    // 2. Log dropoff to sheet
    await logDropoffPhoto({
      area,
      weekId: week,
      day,
      address,
      unit,
      photoUrl: photo.viewUrl,
    });

    // 3. Mark stop as collected (dropped off) in progress — SAFE merge
    // (re-reads the latest sheet row right before write) so a concurrent
    // driver session can't clobber this dropoff.
    const key = `${String(address).toLowerCase().trim()}|${String(unit).trim()}`;
    await mergeDriverProgress(area, week, day, {
      [key]: { status: "collected", time: new Date().toISOString() },
    });

    return NextResponse.json({
      ok: true,
      photoUrl: photo.viewUrl,
    });
  } catch (err) {
    console.error("Driver dropoff error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
