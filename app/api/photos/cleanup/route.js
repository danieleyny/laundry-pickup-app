import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";
import { deletePhotoRowsOlderThan } from "../../../../lib/sheets";

// Daily retention job (wired to Vercel Cron in vercel.json).
// Deletes driver photos older than PHOTO_RETENTION_DAYS (minimum 30 —
// photos are ALWAYS kept for at least 30 days) plus their metadata rows.
//
// Auth: Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>".
// You can also run it manually with ?pin=<ADMIN_PIN>.

export const maxDuration = 60;

function getRetentionDays() {
  const n = parseInt(process.env.PHOTO_RETENTION_DAYS || "", 10);
  return isNaN(n) ? 30 : Math.max(30, n);
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);

  const cronOk =
    process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const pinOk =
    process.env.ADMIN_PIN && searchParams.get("pin") === process.env.ADMIN_PIN;

  if (!cronOk && !pinOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retentionDays = getRetentionDays();
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  try {
    // Collect every expired blob first (across all pages), then delete —
    // deleting mid-pagination can make the cursor skip items.
    const expiredUrls = [];
    let cursor;
    let hasMore = true;
    while (hasMore) {
      const res = await list({ prefix: "driver-photos/", cursor, limit: 1000 });
      for (const blob of res.blobs) {
        if (new Date(blob.uploadedAt).getTime() < cutoffMs) {
          expiredUrls.push(blob.url);
        }
      }
      cursor = res.cursor;
      hasMore = res.hasMore;
    }

    // Delete in batches
    for (let i = 0; i < expiredUrls.length; i += 100) {
      await del(expiredUrls.slice(i, i + 100));
    }

    // Prune the matching metadata rows from the Photos tab
    const rowsRemoved = await deletePhotoRowsOlderThan(cutoffMs);

    return NextResponse.json({
      ok: true,
      retentionDays,
      cutoff: new Date(cutoffMs).toISOString(),
      blobsDeleted: expiredUrls.length,
      metadataRowsRemoved: rowsRemoved,
    });
  } catch (err) {
    console.error("Photo cleanup error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
