// One-off: upload laundrydaylogo.png to Cloudinary at the exact public_id
// the redesign references (laundry/email-icons/leaf-logo). Overwrites if it
// already exists so re-running is safe.
import { readFileSync } from "fs";
for (const line of readFileSync(".env.vercel-pull", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
const { v2: cloudinary } = await import("cloudinary");
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
const result = await cloudinary.uploader.upload("./laundrydaylogo.png", {
  public_id: "laundry/email-icons/leaf-logo",
  overwrite: true,
  resource_type: "image",
  invalidate: true,
});
console.log("uploaded:", result.secure_url);
console.log("public_id:", result.public_id);
console.log("size:", result.bytes, "bytes,", result.width, "x", result.height);
