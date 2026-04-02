import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { logPickupConfirmation, getCurrentWeekId, getCustomers, AREA_CONFIG } from "../../../lib/sheets";

// Check if right now is after 10am ET on the confirmed pickup day
function isLateConfirmation(day) {
  const now = new Date();
  // Convert to Eastern Time
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayName = dayNames[et.getDay()];

  // Only alert if confirming for TODAY and it's after 10am
  if (todayName.toLowerCase() !== day.toLowerCase()) return false;
  return et.getHours() >= 10;
}

async function sendLateAlert(email, address, unit, day) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const alertEmail = process.env.ALERT_EMAIL || gmailUser;

  if (!gmailUser || !gmailAppPassword) {
    console.warn("Late confirmation alert skipped — GMAIL_USER or GMAIL_APP_PASSWORD not set");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  const fullAddress = unit ? `${address}, ${unit}` : address;

  await transporter.sendMail({
    from: gmailUser,
    to: alertEmail,
    subject: `Late Pickup Signup - ${day}`,
    text: `A customer signed up for pickup after 10am today (${day}).\n\nEmail: ${email}\nAddress: ${fullAddress}\n\nThis pickup was confirmed after the 10am cutoff.`,
  });
}

// GET /api/confirm?email=x&day=friday&area=uptown&week=2026-W13
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const day = searchParams.get("day");
  const area = searchParams.get("area");
  const week = searchParams.get("week") || getCurrentWeekId();

  if (!email || !day || !area) {
    return NextResponse.json(
      { error: "Missing required parameters: email, day, area" },
      { status: 400 }
    );
  }

  try {
    // Look up customer name from the sheet
    const customers = await getCustomers(area);
    const customer = customers.find((c) =>
      c.emails.some((e) => e.toLowerCase() === email.toLowerCase())
    );

    // If email not found in customer list, redirect to not_found page
    if (!customer) {
      const notFoundUrl = new URL("/confirm", request.url);
      notFoundUrl.searchParams.set("status", "not_found");
      notFoundUrl.searchParams.set("email", email);
      notFoundUrl.searchParams.set("area", area);
      return NextResponse.redirect(notFoundUrl);
    }

    const customerName = customer.name;

    const result = await logPickupConfirmation(
      area,
      week,
      email.toLowerCase(),
      day,
      customerName
    );

    // Send late confirmation alert if after 10am on the pickup day
    if (result.status === "confirmed" && isLateConfirmation(day)) {
      sendLateAlert(email, customer.address, customer.unit, day).catch((err) =>
        console.error("Failed to send late alert email:", err)
      );
    }

    // Redirect to confirmation page
    const confirmUrl = new URL("/confirm", request.url);
    confirmUrl.searchParams.set("status", result.status);
    confirmUrl.searchParams.set("day", day);
    confirmUrl.searchParams.set("name", customerName.split(",")[0].trim());

    return NextResponse.redirect(confirmUrl);
  } catch (err) {
    console.error("Confirm error:", err);
    const errorUrl = new URL("/confirm", request.url);
    errorUrl.searchParams.set("status", "error");
    return NextResponse.redirect(errorUrl);
  }
}
