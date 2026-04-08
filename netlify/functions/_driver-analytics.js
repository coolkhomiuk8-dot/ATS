// Shared driver analytics helper used by driver-digest-am.js and driver-digest-pm.js

import { getDb } from "./_auth.js";

const STAGE_LABELS = {
  new:             "🆕 New Lead",
  call1:           "📞 First call",
  call2:           "📞 Second call",
  call3:           "📞 Third call",
  video_sent:      "🎬 Video Sent",
  ppw:             "📋 Waiting PPW",
  beenverified:    "🔍 BeenVerified",
  videocall:       "🖥️ Videocall planned",
  on_hold:         "❄️ На паузі",
  offer_sent:      "📨 Offer Sent",
  offer_accepted:  "✅ Offer Accepted",
  drug_test_sched: "💊 Drug Test (sched)",
  drug_test:       "💊 Drug Test (wait)",
  set_date:        "📅 Set date",
  yard:            "🏁 At the yard",
  hired:           "🟢 Hired",
  fired:           "🔴 Fired",
  trash:           "🗑 Trash/Cold",
};

// Stages considered "active" (not terminal)
const ACTIVE_STAGES = new Set([
  "new", "call1", "call2", "call3", "video_sent", "ppw",
  "beenverified", "videocall", "offer_sent", "offer_accepted",
  "drug_test_sched", "drug_test", "set_date", "yard",
]);

// Today's date string in Eastern Time
function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // "2026-04-08"
}

function productivityGrade(total) {
  if (total >= 50) return { icon: "🟢", label: "Відмінно" };
  if (total >= 40) return { icon: "🟡", label: "Добре (таргет)" };
  if (total >= 25) return { icon: "🟠", label: "Задовільно" };
  return { icon: "🔴", label: "Мало" };
}

// isPM = true adds productivity block
export async function buildDriverDigest(label, isPM = false) {
  const db = getDb();
  const snap = await db.collection("drivers").get();
  const drivers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const now = new Date();
  const today = todayET();

  // ── Stage breakdown ──────────────────────────────────────────────────────
  const stageCounts = {};
  for (const d of drivers) {
    if (!d.stage || d.stage === "trash" || d.stage === "fired") continue;
    stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
  }

  // ── Hot leads ────────────────────────────────────────────────────────────
  const hotLeads = drivers.filter(
    (d) => d.interest === "Hot" && ACTIVE_STAGES.has(d.stage)
  );

  // ── Overdue next actions ─────────────────────────────────────────────────
  const overdue = drivers.filter((d) => {
    if (!d.nextActionDate || !ACTIVE_STAGES.has(d.stage)) return false;
    const actionDt = new Date(
      d.nextActionTime
        ? `${d.nextActionDate}T${d.nextActionTime}:00`
        : `${d.nextActionDate}T23:59:00`
    );
    return actionDt < now;
  });

  // ── New today (ET) ───────────────────────────────────────────────────────
  const newToday = drivers.filter((d) => (d.createdAt || "").slice(0, 10) === today);

  // ── Stale 3+ days ────────────────────────────────────────────────────────
  const stale = drivers.filter((d) => {
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

  // ── Productivity (PM only) ────────────────────────────────────────────────
  let contacts = 0;
  let stageChanges = 0;

  if (isPM) {
    for (const d of drivers) {
      // Contacts: lastContact === today
      if ((d.lastContact || "").slice(0, 10) === today) contacts++;

      // Stage changes today: count stageHistory entries with date === today
      if (Array.isArray(d.stageHistory)) {
        for (const entry of d.stageHistory) {
          const entryDate = entry.ts
            ? new Date(entry.ts).toLocaleDateString("en-CA", { timeZone: "America/New_York" })
            : (entry.date || "").slice(0, 10);
          if (entryDate === today) stageChanges++;
        }
      }
    }
  }

  // ── Build message ─────────────────────────────────────────────────────────
  const dateStr = now.toLocaleDateString("uk-UA", {
    day: "numeric", month: "long", weekday: "short", timeZone: "America/New_York",
  });

  let msg = `📊 <b>Аналітика водіїв — ${label}</b>\n`;
  msg += `📅 ${dateStr} (ET)\n\n`;

  const stageOrder = [
    "new", "call1", "call2", "call3", "video_sent", "ppw",
    "beenverified", "videocall", "offer_sent", "offer_accepted",
    "drug_test_sched", "drug_test", "set_date", "yard", "hired", "on_hold",
  ];
  const activeTotal = Object.values(stageCounts).reduce((a, b) => a + b, 0);

  msg += `<b>По стадіях (${activeTotal} активних):</b>\n`;
  for (const stageId of stageOrder) {
    const count = stageCounts[stageId];
    if (!count) continue;
    msg += `  ${STAGE_LABELS[stageId] || stageId}: <b>${count}</b>\n`;
  }

  msg += `\n🆕 <b>Нові сьогодні:</b> ${newToday.length}\n`;

  if (hotLeads.length > 0) {
    msg += `\n🔥 <b>Гарячі ліди (${hotLeads.length}):</b>\n`;
    for (const d of hotLeads.slice(0, 5))
      msg += `  • ${d.name || "—"} (${STAGE_LABELS[d.stage] || d.stage})\n`;
    if (hotLeads.length > 5) msg += `  ...і ще ${hotLeads.length - 5}\n`;
  }

  if (overdue.length > 0) {
    msg += `\n⚠️ <b>Прострочені дії (${overdue.length}):</b>\n`;
    for (const d of overdue.slice(0, 5))
      msg += `  • ${d.name || "—"} — ${d.nextActionDate}${d.nextActionTime ? ` ${d.nextActionTime}` : ""}\n`;
    if (overdue.length > 5) msg += `  ...і ще ${overdue.length - 5}\n`;
  } else {
    msg += `\n✅ Прострочених дій немає\n`;
  }

  if (stale.length > 0) {
    msg += `\n🧊 <b>Завис без дій 3+ дні (${stale.length}):</b>\n`;
    for (const d of stale.slice(0, 5))
      msg += `  • ${d.name || "—"} (${STAGE_LABELS[d.stage] || d.stage})\n`;
    if (stale.length > 5) msg += `  ...і ще ${stale.length - 5}\n`;
  }

  // Productivity block (evening only)
  if (isPM) {
    const totalActions = contacts + stageChanges + newToday.length;
    const grade = productivityGrade(totalActions);
    msg += `\n━━━━━━━━━━━━━━━━━━\n`;
    msg += `📈 <b>Продуктивність HR за день</b>\n`;
    msg += `  📞 Контактів з водіями: <b>${contacts}</b>\n`;
    msg += `  🔄 Змін стадій: <b>${stageChanges}</b>\n`;
    msg += `  🆕 Нових лідів: <b>${newToday.length}</b>\n`;
    msg += `  ───\n`;
    msg += `  Всього дій: <b>${totalActions}</b>\n`;
    msg += `  Оцінка: ${grade.icon} <b>${grade.label}</b>\n`;
  }

  return msg;
}

export async function sendTelegramToHR(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_HR_CHAT_ID;
  if (!token || !chatId) throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_HR_CHAT_ID");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) throw new Error(`Telegram API error ${res.status}: ${await res.text()}`);
}
