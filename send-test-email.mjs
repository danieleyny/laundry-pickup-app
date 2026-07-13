// Local-only: send the redesigned emails to a test inbox via the real prod pipeline.
// Usage: node send-test-email.mjs [which]   which = main|remaining|confirmed|all (default main)
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.vercel-pull','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) { let v = m[2]; if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1); process.env[m[1]] = v; }
}
const { buildMainEmail, buildRemainingEmail, buildConfirmedEmail } = await import('./lib/email-templates.js');
const { sendBccEmail } = await import('./lib/email.js');
function weekId(){const n=new Date();const t=new Date(n.valueOf());const d=(n.getDay()+6)%7;t.setDate(t.getDate()-d+3);const j=new Date(t.getFullYear(),0,4);const w=1+Math.round(((t-j)/86400000)/7);return `${t.getFullYear()}-W${String(w).padStart(2,'0')}`;}
const TO='danieleyny@gmail.com', area='downtown', week=weekId();
const which=(process.argv[2]||'main');
const stamp=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const all={
  main:{b:buildMainEmail(area),ctx:{area,week,day1:'Tuesday',day2:'Thursday'}},
  remaining:{b:buildRemainingEmail(area,'Thursday'),ctx:{area,week,day:'Thursday'}},
  confirmed:{b:buildConfirmedEmail(),ctx:{area,week}},
};
const keys = which==='all'?Object.keys(all):[which];
for(const k of keys){const j=all[k];
  const r=await sendBccEmail({recipients:[TO],subject:`[Test ${stamp}] ${j.b.subject}`,text:j.b.text,html:j.b.html,linkContext:j.ctx});
  console.log(`${k}: sent=${r.sent} errors=${JSON.stringify(r.errors||[])}`);
}
