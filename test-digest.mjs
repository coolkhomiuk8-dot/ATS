import { readFileSync } from "fs";

// Load .env
const env = readFileSync(".env", "utf-8");
env.split("\n").forEach(line => {
  const [k, ...v] = line.split("=");
  if (k && v.length) process.env[k.trim()] = v.join("=").trim();
});

import admin from "firebase-admin";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const STAGE_LABELS = {
  new: "🆕 New Lead", call1: "📞 First call", call2: "📞 Second call",
  call3: "📞 Third call", video_sent: "🎬 Video Sent", ppw: "📋 Waiting PPW",
  beenverified: "🔍 BeenVerified", videocall: "🖥️ Videocall planned",
  on_hold: "❄️ На паузі", offer_sent: "📨 Offer Sent",
  offer_accepted: "✅ Offer Accepted", drug_test_sched: "💊 Drug Test (sched)",
  drug_test: "💊 Drug Test (wait)", set_date: "📅 Set date",
  yard: "🏁 At the yard", hired: "🟢 Hired", fired: "🔴 Fired", trash: "🗑 Trash/Cold",
};

const ACTIVE_STAGES = new Set([
  "new","call1","call2","call3","video_sent","ppw","beenverified",
  "videocall","offer_sent","offer_accepted","drug_test_sched","drug_test","set_date","yard",
]);

const snap = await db.collection("drivers").get();
const drivers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
const now = new Date();
const todayStr = now.toISOString().slice(0, 10);

const stageCounts = {};
for (const d of drivers) {
  if (!d.stage || d.stage === "trash" || d.stage === "fired") continue;
  stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
}

const hotLeads = drivers.filter(d => d.interest === "Hot" && ACTIVE_STAGES.has(d.stage));
const overdue = drivers.filter(d => {
  if (!d.nextActionDate || !ACTIVE_STAGES.has(d.stage)) return false;
  const dt = new Date(d.nextActionTime ? `${d.nextActionDate}T${d.nextActionTime}:00` : `${d.nextActionDate}T23:59:00`);
  return dt < now;
});
const newToday = drivers.filter(d => (d.createdAt || "").slice(0, 10) === todayStr);
const stale = drivers.filter(d => {
  if (!ACTIVE_STAGES.has(d.stage)) return false;
  let lastChange;
  if (Array.isArray(d.stageHistory) && d.stageHistory.length > 0) {
    const last = d.stageHistory[d.stageHistory.length - 1];
    lastChange = last.ts ? new Date(last.ts) : new Date(last.date || 0);
  } else {
    lastChange = new Date(d.createdAt || 0);
  }
  return (now - lastChange) / (1000 * 60 * 60 * 24) >= 3;
});

const dateStr = now.toLocaleDateString("uk-UA", { day: "numeric", month: "long", weekday: "short", timeZone: "Europe/Kyiv" });
const activeTotal = Object.values(stageCounts).reduce((a, b) => a + b, 0);

let msg = `📊 <b>Аналітика водіїв — Позачерговий дайджест 🔔</b>\n`;
msg += `📅 ${dateStr}\n\n`;
msg += `<b>По стадіях (${activeTotal} активних):</b>\n`;

const stageOrder = ["new","call1","call2","call3","video_sent","ppw","beenverified","videocall","offer_sent","offer_accepted","drug_test_sched","drug_test","set_date","yard","hired","on_hold"];
for (const s of stageOrder) {
  if (!stageCounts[s]) continue;
  msg += `  ${STAGE_LABELS[s] || s}: <b>${stageCounts[s]}</b>\n`;
}

msg += `\n🆕 <b>Нові сьогодні:</b> ${newToday.length}\n`;

if (hotLeads.length > 0) {
  msg += `\n🔥 <b>Гарячі ліди (${hotLeads.length}):</b>\n`;
  for (const d of hotLeads.slice(0, 5)) msg += `  • ${d.name || "—"} (${STAGE_LABELS[d.stage] || d.stage})\n`;
  if (hotLeads.length > 5) msg += `  ...і ще ${hotLeads.length - 5}\n`;
}

if (overdue.length > 0) {
  msg += `\n⚠️ <b>Прострочені дії (${overdue.length}):</b>\n`;
  for (const d of overdue.slice(0, 5)) msg += `  • ${d.name || "—"} — ${d.nextActionDate}${d.nextActionTime ? ` ${d.nextActionTime}` : ""}\n`;
  if (overdue.length > 5) msg += `  ...і ще ${overdue.length - 5}\n`;
} else {
  msg += `\n✅ Прострочених дій немає\n`;
}

if (stale.length > 0) {
  msg += `\n🧊 <b>Завис без дій 3+ дні (${stale.length}):</b>\n`;
  for (const d of stale.slice(0, 5)) msg += `  • ${d.name || "—"} (${STAGE_LABELS[d.stage] || d.stage})\n`;
  if (stale.length > 5) msg += `  ...і ще ${stale.length - 5}\n`;
}

// Send to HR chat
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_HR_CHAT_ID;
const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
});
const result = await res.json();
console.log(result.ok ? "✅ Дайджест відправлено в HR чат!" : JSON.stringify(result));
process.exit(0);
