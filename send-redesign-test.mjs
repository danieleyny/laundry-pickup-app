// Local-only: side-by-side preview of the redesign candidate vs the live design.
// Sends 6 emails to danieleyny@gmail.com — 3 tagged [REDESIGN], 3 tagged [CURRENT]
// — using the prod sendBccEmail pipeline (so links + placeholders behave
// identically to a real send). Models send-test-email.mjs exactly.
//
// Usage: node send-redesign-test.mjs
//
// Guardrail: nothing in this file (or this script's existence) touches the
// production cron / admin / ETA-alert flows. It just exercises the two
// builder modules side by side so the redesign can be approved before
// promotion.
import { readFileSync } from "fs";

for (const line of readFileSync(".env.vercel-pull", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const current = await import("./lib/email-templates.js");
const redesign = await import("./lib/email-templates.redesign.js");
const { sendBccEmail } = await import("./lib/email.js");

function weekId() {
  const n = new Date();
  const t = new Date(n.valueOf());
  const d = (n.getDay() + 6) % 7;
  t.setDate(t.getDate() - d + 3);
  const j = new Date(t.getFullYear(), 0, 4);
  const w = 1 + Math.round(((t - j) / 86400000) / 7);
  return `${t.getFullYear()}-W${String(w).padStart(2, "0")}`;
}

const TO = "danieleyny@gmail.com";
const area = "downtown";
const week = weekId();
const day1 = "Tuesday";
const day2 = "Thursday";

const variants = [
  { key: "main",       label: "weekly main",     ctx: { area, week, day1, day2 } },
  { key: "remaining",  label: "today reminder",  ctx: { area, week, day: day2 } },
  { key: "confirmed",  label: "confirmation",    ctx: { area, week } },
];

function build(mod, key) {
  if (key === "main") return mod.buildMainEmail(area);
  if (key === "remaining") return mod.buildRemainingEmail(area, day2);
  return mod.buildConfirmedEmail();
}

async function sendOne(tag, mod, v) {
  const built = build(mod, v.key);
  const subject = `[${tag}] ${built.subject}`;
  const r = await sendBccEmail({
    recipients: [TO],
    subject,
    text: built.text,
    html: built.html,
    linkContext: v.ctx,
  });
  return { tag, key: v.key, label: v.label, sent: r.sent, errors: r.errors || [] };
}

const results = [];
// Order: REDESIGN first (top of inbox), then CURRENT — so they sit side by side
// in date-sorted view.
for (const v of variants) results.push(await sendOne("REDESIGN", redesign, v));
for (const v of variants) results.push(await sendOne("CURRENT", current, v));

const ok = results.filter((r) => r.sent && r.errors.length === 0);
const failed = results.filter((r) => !r.sent || r.errors.length > 0);
console.log(`\nSent ${ok.length}/${results.length} to ${TO}`);
for (const r of results) {
  const status = r.sent && !r.errors.length ? "✓" : "✗";
  console.log(`  ${status} [${r.tag}] ${r.label.padEnd(16)}  sent=${r.sent}  errors=${JSON.stringify(r.errors)}`);
}
if (failed.length) process.exit(1);
