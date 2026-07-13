import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary from env vars (lazy — runs on first call)
function configure() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary env vars not set: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}

// Normalize folder name: lowercase, spaces → hyphens, alphanumeric only
function normalizeSegment(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function normalizeFolder(subfolder) {
  return subfolder.split("/").map(normalizeSegment).filter(Boolean).join("/");
}

// Upload a photo Buffer. Same interface as the previous lib/drive.js helper.
// subfolder format: "Pickup Issues/2026-W18/Tuesday" — gets normalized to a Cloudinary folder path.
async function uploadPhoto({ buffer, mimeType, filename, subfolder }) {
  const cloud = configure();
  const folder = `laundry/${normalizeFolder(subfolder || "uncategorized")}`;
  const publicId = filename.replace(/\.[^.]+$/, ""); // strip extension; Cloudinary tracks format separately

  // Convert buffer to data URI (Cloudinary's simplest upload path that supports Buffer in serverless)
  const dataUri = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;

  const result = await cloud.uploader.upload(dataUri, {
    folder,
    public_id: publicId,
    resource_type: "image",
    overwrite: false,
    unique_filename: true,
  });

  return {
    id: result.public_id,
    viewUrl: result.secure_url,
    directUrl: result.secure_url,
  };
}

// Delete photos older than `daysOld` whose folder path starts with the given subfolder.
// Matches the previous Drive helper's interface so the cleanup cron doesn't need rewriting.
async function deleteOldPhotos(subfolder, daysOld) {
  const cloud = configure();
  const prefix = `laundry/${normalizeFolder(subfolder)}`;
  const cutoffMs = Date.now() - daysOld * 24 * 60 * 60 * 1000;

  let nextCursor;
  let deleted = 0;
  // Cloudinary's admin API lists resources by folder prefix
  do {
    const list = await cloud.api.resources({
      type: "upload",
      prefix,
      max_results: 100,
      next_cursor: nextCursor,
    });
    const oldOnes = (list.resources || []).filter(
      (r) => new Date(r.created_at).getTime() < cutoffMs
    );
    if (oldOnes.length > 0) {
      const ids = oldOnes.map((r) => r.public_id);
      // Batch delete (Cloudinary allows up to 100 per call)
      await cloud.api.delete_resources(ids);
      deleted += ids.length;
    }
    nextCursor = list.next_cursor;
  } while (nextCursor);

  return { deleted };
}

export { uploadPhoto, deleteOldPhotos };
