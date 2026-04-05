import nodemailer from "nodemailer";

// Cutoff hour (Eastern Time) — signups after this hour trigger a late notification
export const LATE_CUTOFF_HOUR = 10; // 10:00 AM

/**
 * Returns true if the current Eastern Time hour is >= LATE_CUTOFF_HOUR.
 */
export function isLateSignup() {
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etString);
  return etDate.getHours() >= LATE_CUTOFF_HOUR;
}

/**
 * Sends an email notification to the admin when a late signup occurs.
 * Requires SMTP_HOST, SMTP_USER, SMTP_PASS, and NOTIFICATION_EMAIL env vars.
 * Silently skips if they are not configured.
 */
export async function sendLateSignupNotification({ customerName, email, day, area, timestamp }) {
  if (!process.env.NOTIFICATION_EMAIL || !process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log("[Late Signup] Email notification skipped: SMTP not configured.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const timeLabel = new Date(timestamp).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  });

  await transporter.sendMail({
    from: `"Laundry Pickup" <${process.env.SMTP_USER}>`,
    to: process.env.NOTIFICATION_EMAIL,
    subject: `⚠️ Late Laundry Signup — ${customerName} (${day})`,
    text: [
      `A late signup was received after ${LATE_CUTOFF_HOUR}:00 AM ET.`,
      ``,
      `Customer : ${customerName}`,
      `Email    : ${email}`,
      `Day      : ${day}`,
      `Area     : ${area}`,
      `Time     : ${timeLabel} ET`,
    ].join("\n"),
  });
}
