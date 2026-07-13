import { NextResponse } from "next/server";
import { sendEmail, sendBccEmail, DEFAULT_FROM, DEFAULT_REPLY_TO } from "../../../../lib/email";
import {
  buildMainEmail,
  buildRemainingEmail,
  buildConfirmedEmail,
  SIGNATURE_TEXT as TEMPLATE_SIGNATURE,
} from "../../../../lib/email-templates";

// Allow up to 60s for the cron to complete (Vercel default is 10s).
// 161 recipients in batches of 50 = ~4 API calls, each ~1-2s = well within 60s.
export const maxDuration = 60;
import {
  getCustomers,
  getPickupResponses,
  getCurrentWeekId,
  getSetting,
  setSetting,
  getOptOuts,
  getStaleCustomers,
  AREA_CONFIG,
} from "../../../../lib/sheets";
import { deleteOldPhotos } from "../../../../lib/cloudinary";

// Force dynamic rendering — this route uses request data and must not be statically optimized
export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pickup.laundryday.nyc";

const TERMS_URL =
  "https://laundryday.nyc/assets/partnerassets/documents/Terms%20Of%20Service.pdf";

// (Email infrastructure now goes through lib/email.js using Resend)

// ─── Plain-text signature for the text/* fallback ─────────────────────────────
const SIGNATURE_TEXT = `
--
The Laundry Day Team
(646) 705-0600 - laundrydaynyc@gmail.com
Our Website: https://laundryday.nyc
Terms & Services: ${TERMS_URL}

To unsubscribe from these reminders: {{UNSUBSCRIBE_LINK}}
`.trim();

// Email builders (buildMainEmail / buildRemainingEmail / buildConfirmedEmail)
// now live in lib/email-templates.js so the cron + the preview endpoint
// send byte-identical emails.

// ─── Email send helpers ───────────────────────────────────────────────────────

// Get the email address that should receive admin alerts
function getAlertEmail() {
  return process.env.ALERT_EMAIL || process.env.GMAIL_USER || "laundrydaynyc@gmail.com";
}

// Send a summary alert email to the admin so they know what went out (success or failure).
// Always attempts to send; never throws — failures are only logged.
async function sendAdminSummary(results, fatalError) {
  const alertEmail = getAlertEmail();
  const hasErrors = fatalError || results.some((r) => r.error);
  const subject = hasErrors
    ? "⚠️ Laundry Day NYC — Scheduled email run had ERRORS"
    : "✓ Laundry Day NYC — Scheduled emails sent";

  const lines = results.map((r) => {
    if (r.error) {
      return `❌ ${r.label}: FAILED — ${r.error}`;
    }
    if (r.skipped) {
      return `· ${r.label}: skipped (${r.skipped})`;
    }
    return `✓ ${r.label}: sent to ${r.sent} recipients in ${r.batches} batch(es)${r.errors?.length ? ` (${r.errors.length} batch error(s))` : ""}`;
  });

  let body = `Scheduled email run ${hasErrors ? "had errors" : "complete"}:\n\n`;
  body += lines.join("\n");
  if (fatalError) {
    body += `\n\n❌ FATAL ERROR (run aborted): ${fatalError}`;
  }
  body += `\n\nTime: ${new Date().toISOString()}`;

  try {
    await sendEmail({ to: alertEmail, subject, text: body });
  } catch (e) {
    console.warn("Admin summary failed:", e.message);
  }
}

// Persist the last-run status to the Settings tab so the dashboard can show it
async function recordLastRun(status, summary) {
  try {
    await setSetting("last_cron_run_time", new Date().toISOString());
    await setSetting("last_cron_run_status", status);
    await setSetting("last_cron_run_summary", summary.slice(0, 480));
  } catch (e) {
    console.warn("Failed to record last run:", e.message);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

// GET /api/cron/send-scheduled-emails
//
// Called by Vercel Cron at 11:20 UTC and 12:20 UTC daily. Validates ET time is
// 7:20 AM, checks the scheduling toggle, and sends the right email(s) for the
// day of the week.
//
// Admin testing options (require ?pin=<ADMIN_PIN>):
//   • ?day=Tuesday          — manually trigger a specific day's emails (sends real)
//   • ?preview=email@x.com  — send preview emails for ALL formats to one address
//   • ?preview=...&only=ID  — preview just one format (downtown-main, etc.)
//   • ?dryRun=true          — go through all the logic but DON'T send any email;
//                             returns recipient counts + sample HTML so you can
//                             verify the cron works end-to-end without spam.
//                             Combine with ?day=X to test a specific day.
// Top-level watchdog: if anything throws unexpectedly, attempt a last-ditch
// admin alert so we're never blind to silent cron failures.
export async function GET(request) {
  try {
    return await handleCronRequest(request);
  } catch (criticalError) {
    console.error("Cron critical failure (outside normal flow):", criticalError);
    try {
      const alertEmail = process.env.ALERT_EMAIL || process.env.GMAIL_USER || "laundrydaynyc@gmail.com";
      await sendEmail({
        to: alertEmail,
        subject: "🚨 Laundry Day NYC — CRON CRITICAL FAILURE",
        text: `The scheduled email cron crashed before completing normal processing.\n\nError: ${criticalError.message || String(criticalError)}\nStack: ${criticalError.stack || "(no stack)"}\n\nTime: ${new Date().toISOString()}\n\nNo customer emails were sent. Investigate immediately. You may need to manually fire today's email via:\nhttps://pickup.laundryday.nyc/api/cron/send-scheduled-emails?pin=ADMIN_PIN&day=DayName`,
      });
    } catch (alertErr) {
      console.error("Watchdog alert also failed:", alertErr);
    }
    try {
      await setSetting("last_cron_run_time", new Date().toISOString());
      await setSetting("last_cron_run_status", "error");
      await setSetting("last_cron_run_summary", `CRITICAL: ${(criticalError.message || String(criticalError)).slice(0, 400)}`);
    } catch {}
    return NextResponse.json(
      { status: "critical_error", error: criticalError.message || String(criticalError) },
      { status: 500 }
    );
  }
}

async function handleCronRequest(request) {
  const { searchParams } = new URL(request.url);
  const forcePin = searchParams.get("pin");
  const forceDay = searchParams.get("day");
  const previewEmail = searchParams.get("preview");
  const dryRun = searchParams.get("dryRun") === "true";
  const includeHtml = searchParams.get("includeHtml") === "true";
  const isAdminAuthed = forcePin && forcePin === process.env.ADMIN_PIN;
  const isPreview = isAdminAuthed && previewEmail;
  const isManualForce = isAdminAuthed && forceDay;

  // Authorization: accept EITHER a valid CRON_SECRET bearer header (from Vercel cron)
  // OR a valid admin PIN in the query string (for manual admin testing).
  const authHeader = request.headers.get("authorization");
  const hasValidCronSecret =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && !hasValidCronSecret && !isAdminAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Photo retention cleanup runs on every cron fire (regardless of email day).
  // Skipped in dry runs and previews so we don't delete real files during testing.
  let cleanupResult = null;
  if (!dryRun && !isPreview && process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      const [issuesCleanup, dropoffsCleanup] = await Promise.all([
        deleteOldPhotos("Pickup Issues", 7),
        deleteOldPhotos("Dropoffs", 90),
      ]);
      cleanupResult = {
        issuesDeleted: issuesCleanup.deleted || 0,
        dropoffsDeleted: dropoffsCleanup.deleted || 0,
      };
    } catch (e) {
      console.warn("Photo cleanup failed:", e.message);
    }
  }

  // Preview mode: send email formats to a single email so admin can check formatting
  // Optional ?only=downtown-main|downtown-remaining|downtown-confirmed|uptown-main|...
  if (isPreview) {
    try {
      const previewTasks = [
        { area: "downtown", kind: "main", labelExtra: "Tuesday", id: "downtown-main" },
        { area: "downtown", kind: "remaining", day: "Thursday", id: "downtown-remaining" },
        { area: "downtown", kind: "confirmed", day: "Thursday", id: "downtown-confirmed" },
        { area: "uptown", kind: "main", labelExtra: "Friday", id: "uptown-main" },
        { area: "uptown", kind: "remaining", day: "Saturday", id: "uptown-remaining" },
        { area: "uptown", kind: "confirmed", day: "Saturday", id: "uptown-confirmed" },
      ];
      const onlyId = searchParams.get("only");
      const tasksToRun = onlyId
        ? previewTasks.filter((t) => t.id === onlyId)
        : previewTasks;
      if (tasksToRun.length === 0) {
        return NextResponse.json({
          status: "error",
          error: `Unknown preview id: ${onlyId}. Valid ids: ${previewTasks.map((t) => t.id).join(", ")}`,
        }, { status: 400 });
      }
      const results = [];
      const week = getCurrentWeekId();
      for (const t of tasksToRun) {
        let built;
        if (t.kind === "main") built = buildMainEmail(t.area);
        else if (t.kind === "remaining") built = buildRemainingEmail(t.area, t.day);
        else built = buildConfirmedEmail();
        // Use sendBccEmail (with linkContext) so the {{CONFIRM_LINK_*}} and
        // {{UNSUBSCRIBE_LINK}} placeholders get substituted per recipient —
        // the preview then matches exactly what a customer sees.
        const config = AREA_CONFIG[t.area];
        const linkContext = {
          area: t.area,
          week,
          ...(t.kind === "main"
            ? { day1: config.day1, day2: config.day2 }
            : { day: t.day }),
        };
        await sendBccEmail({
          recipients: [previewEmail],
          subject: built.subject,
          text: built.text,
          html: built.html,
          linkContext,
        });
        results.push(`${t.area} ${t.kind}${t.day ? " (" + t.day + ")" : ""}`);
      }
      return NextResponse.json({
        status: "preview_sent",
        to: previewEmail,
        emails: results,
      });
    } catch (err) {
      console.error("Preview send error:", err);
      return NextResponse.json(
        { status: "error", error: err.message },
        { status: 500 }
      );
    }
  }

  // Check if scheduling is enabled (skip for manual force AND dry runs by admin)
  if (!isManualForce && !(dryRun && isAdminAuthed)) {
    const enabled = await getSetting("email_scheduling_enabled", "false");
    if (enabled !== "true") {
      return NextResponse.json({
        status: "skipped",
        reason: "email_scheduling_enabled is false",
      });
    }
  }

  // Determine current ET time and weekday
  let etDay; // 0=Sun, 1=Mon, ... 6=Sat
  let etHour, etMinute;
  if (isManualForce || (dryRun && isAdminAuthed && forceDay)) {
    const dayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    etDay = dayMap[forceDay.toLowerCase()];
    etHour = 7;
    etMinute = 20;
  } else {
    const now = new Date();
    const etStr = now.toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour12: false,
    });
    const et = new Date(etStr);
    etDay = et.getDay();
    etHour = et.getHours();
    etMinute = et.getMinutes();
    // Accept firings 7:00–7:59 AM ET. On Vercel Pro the cron fires with
    // per-minute precision (no ±59min Hobby variance), so a "20 11 * * *"
    // cron lands at exactly 11:20 UTC = 7:20 AM EDT (or "20 12 * * *" at
    // 7:20 EST in winter). The 1-hour window keeps a buffer for retries
    // and brief deploy gaps. The same-day dedup below blocks the second
    // cron (EDT vs EST counterpart) from firing the same morning.
    if (!dryRun && etHour !== 7) {
      return NextResponse.json({
        status: "skipped",
        reason: `not within morning send window 7:00–7:59 AM ET (current: ${etHour}:${String(etMinute).padStart(2, "0")} ET)`,
      });
    }
  }

  // Same-day dedup: if we already recorded a successful run today (ET),
  // skip this firing. Prevents the 11:20 and 12:20 UTC crons from both
  // sending emails on the same day. Skipped for manual force + dry runs.
  if (!isManualForce && !dryRun) {
    try {
      const lastRunISO = await getSetting("last_cron_run_time", "");
      if (lastRunISO) {
        const lastRunDate = new Date(lastRunISO).toLocaleDateString("en-US", {
          timeZone: "America/New_York",
        });
        const todayDate = new Date().toLocaleDateString("en-US", {
          timeZone: "America/New_York",
        });
        if (lastRunDate === todayDate) {
          return NextResponse.json({
            status: "skipped",
            reason: `already ran today (${todayDate}) at ${lastRunISO}`,
          });
        }
      }
    } catch (e) {
      console.warn("Same-day dedup check failed (proceeding anyway):", e.message);
    }
  }

  // Determine which emails to send today
  const tasks = []; // [{ area, kind: 'main' | 'remaining' | 'confirmed', day }]
  if (etDay === 2) {
    tasks.push({ area: "downtown", kind: "main" });
  } else if (etDay === 4) {
    tasks.push({ area: "downtown", kind: "remaining", day: "Thursday" });
    tasks.push({ area: "downtown", kind: "confirmed", day: "Thursday" });
  } else if (etDay === 5) {
    tasks.push({ area: "uptown", kind: "main" });
  } else if (etDay === 6) {
    tasks.push({ area: "uptown", kind: "remaining", day: "Saturday" });
    tasks.push({ area: "uptown", kind: "confirmed", day: "Saturday" });
  } else if (etDay === 1) {
    // Monday: no customer-facing emails, but run stale-customer detection and alert admin
    try {
      const [staleDt, staleUp] = await Promise.all([
        getStaleCustomers("downtown", 8),
        getStaleCustomers("uptown", 8),
      ]);
      const total = staleDt.length + staleUp.length;
      if (total > 0) {
        const formatList = (area, list) => {
          if (list.length === 0) return "";
          return `\n${area.toUpperCase()} (${list.length}):\n` +
            list.map((c) => {
              const name = (c.name || "").split(",")[0].trim();
              const when = c.lastConfirmedDate === "never" ? "never confirmed" :
                `last seen ${new Date(c.lastConfirmedMs).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`;
              return `  • ${name} — ${c.address}${c.unit ? " #" + c.unit : ""} (${c.emails[0]}) — ${when}`;
            }).join("\n");
        };
        await sendEmail({
          to: process.env.ALERT_EMAIL || process.env.GMAIL_USER || "laundrydaynyc@gmail.com",
          subject: `📋 Laundry Day NYC — ${total} customer${total === 1 ? "" : "s"} inactive 8+ weeks`,
          text: `Weekly stale-customer check: ${total} customer${total === 1 ? "" : "s"} haven't confirmed a pickup in 8+ weeks.\n${formatList("downtown", staleDt)}${formatList("uptown", staleUp)}\n\nThese might be candidates for follow-up, unsubscribing, or removal from your list.\n\nTime: ${new Date().toISOString()}`,
        });
      }
    } catch (e) {
      console.warn("Stale customer detection failed:", e.message);
    }
    return NextResponse.json({
      status: "skipped",
      reason: "monday — ran stale-customer detection only",
    });
  } else {
    return NextResponse.json({
      status: "skipped",
      reason: `no scheduled emails for day ${etDay} (Sun=0, Mon=1, ..., Sat=6)`,
    });
  }

  // Always-attempt-summary pattern: even if we fail mid-flight, try to email the admin.
  let fatalError = null;
  const results = [];
  const week = getCurrentWeekId();

  try {
    for (const task of tasks) {
      const config = AREA_CONFIG[task.area];
      let label = `${task.area} ${task.kind}${task.day ? " (" + task.day + ")" : ""}`;

      try {
        const customers = await getCustomers(task.area);
        let recipients = [];
        let subject = "";
        let text = "";
        let html = "";

        if (task.kind === "main") {
          recipients = customers.flatMap((c) => c.emails);
          const m = buildMainEmail(task.area);
          subject = m.subject;
          text = m.text;
          html = m.html;
          label = `${task.area} main (${config.day1} & ${config.day2})`;
        } else if (task.kind === "remaining") {
          const responses = await getPickupResponses(task.area, week);
          const confirmedEmails = new Set(
            responses.map((r) => r[2]?.toLowerCase()).filter(Boolean)
          );
          const remainingCustomers = customers.filter(
            (c) => !c.emails.some((e) => confirmedEmails.has(e.toLowerCase()))
          );
          recipients = remainingCustomers.flatMap((c) => c.emails);
          const r = buildRemainingEmail(task.area, task.day);
          subject = r.subject;
          text = r.text;
          html = r.html;
          label = `${task.area} remaining (${task.day})`;
        } else if (task.kind === "confirmed") {
          const responses = await getPickupResponses(task.area, week);
          const confirmedForDay = new Set(
            responses
              .filter((r) => r[3]?.toLowerCase() === task.day.toLowerCase())
              .map((r) => r[2]?.toLowerCase())
              .filter(Boolean)
          );
          const matchingCustomers = customers.filter((c) =>
            c.emails.some((e) => confirmedForDay.has(e.toLowerCase()))
          );
          recipients = matchingCustomers.flatMap((c) => c.emails);
          const c = buildConfirmedEmail();
          subject = c.subject;
          text = c.text;
          html = c.html;
          label = `${task.area} confirmed (${task.day})`;
        }

        // Filter out opted-out addresses
        const optOuts = await getOptOuts();
        const beforeFilter = recipients.length;
        recipients = recipients.filter((e) => !optOuts.has(e.toLowerCase().trim()));
        if (beforeFilter !== recipients.length) {
          console.log(`Filtered ${beforeFilter - recipients.length} opted-out recipients from ${label}`);
        }

        if (dryRun) {
          const taskResult = {
            label,
            recipientCount: recipients.length,
            sampleRecipients: recipients.slice(0, 5),
            subject,
            batches: Math.ceil(recipients.length / 45) || 0,
            wouldSend: recipients.length > 0,
          };
          if (includeHtml) taskResult.html = html;
          results.push(taskResult);
        } else {
          // Phase 2 one-tap: pass area/week/day(s) so per-recipient confirm
          // links are HMAC-signed. Falls back to /pickup?... if CONFIRM_SECRET
          // is unset, so the cron stays safe.
          const linkContext = {
            area: task.area,
            week,
            ...(task.kind === "main"
              ? { day1: config.day1, day2: config.day2 }
              : { day: task.day }),
          };
          const result = await sendBccEmail({
            recipients,
            subject,
            text,
            html,
            linkContext,
          });
          results.push({ label, ...result });
        }
      } catch (taskErr) {
        console.error(`Task failed [${label}]:`, taskErr);
        results.push({ label, error: taskErr.message || String(taskErr) });
      }
    }

    if (dryRun) {
      return NextResponse.json({
        status: "dry_run",
        note: "No emails were sent. This shows what WOULD have happened.",
        etDay,
        etTime: `${etHour}:${String(etMinute).padStart(2, "0")} ET`,
        weekId: week,
        tasksPlanned: tasks.length,
        results,
      });
    }
  } catch (err) {
    console.error("Cron fatal error:", err);
    fatalError = err.message || String(err);
  }

  if (!dryRun) {
    // Build summary text for both admin email and dashboard "last run" indicator
    const summaryLines = results.map((r) => {
      if (r.error) return `FAILED ${r.label}: ${r.error}`;
      if (r.skipped) return `skipped ${r.label}: ${r.skipped}`;
      return `sent ${r.label}: ${r.sent} recipients`;
    });
    const summaryText = summaryLines.join(" | ") + (fatalError ? ` | FATAL: ${fatalError}` : "");
    const overallStatus =
      fatalError || results.some((r) => r.error) ? "error" : "success";

    // Always try to send admin summary; if Resend itself fails, we still record to dashboard
    await sendAdminSummary(results, fatalError);
    await recordLastRun(overallStatus, summaryText);

    return NextResponse.json({
      status: overallStatus,
      etDay,
      results,
      fatalError,
    }, { status: overallStatus === "error" ? 500 : 200 });
  }
}
