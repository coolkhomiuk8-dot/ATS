// Shared driver analytics helper used by driver-digest-am.js and driver-digest-pm.js

import { getDb } from "./_auth.js";
import { getEmmaCallStats } from "./_ringcentral.js";

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

// Trim driver name to first 25 chars — avoids form-dump garbage in Telegram
function dName(d) {
  const raw = (d.name || "—").trim();
  return raw.length > 25 ? raw.slice(0, 25) + "…" : raw;
}

// Today's date string in Eastern Time
function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // "2026-04-08"
}

function productivityGrade(total) {
  if (total >= 45) return { icon: "🟢", label: "Відмінно" };
  if (total >= 35) return { icon: "🟡", label: "Добре" };
  if (total >= 20) return { icon: "🟠", label: "Задовільно" };
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

  // ── Today's stage gains (08:00–18:00 ET) ─────────────────────────────────
  const todayGains = {};
  for (const d of drivers) {
    if (!Array.isArray(d.stageHistory)) continue;
    for (const entry of d.stageHistory) {
      let entryDate, entryHour;
      if (entry.ts) {
        const dt = new Date(entry.ts);
        entryDate = dt.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        entryHour = parseInt(
          dt.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }),
          10
        );
      } else {
        entryDate = (entry.date || "").slice(0, 10);
        entryHour = 12; // no time info — assume midday
      }
      if (entryDate !== today) continue;
      if (entryHour < 8 || entryHour >= 18) continue;
      const stage = entry.stage || entry.to;
      if (stage) todayGains[stage] = (todayGains[stage] || 0) + 1;
    }
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
  let stageChanges = 0;

  if (isPM) {
    for (const d of drivers) {

      // Stage changes today: call1/call2/call3 = 0.5, everything else = 1
      if (Array.isArray(d.stageHistory)) {
        for (const entry of d.stageHistory) {
          const entryDate = entry.ts
            ? new Date(entry.ts).toLocaleDateString("en-CA", { timeZone: "America/New_York" })
            : (entry.date || "").slice(0, 10);
          if (entryDate !== today) continue;
          const stage = entry.stage || entry.to || "";
          stageChanges += ["call1", "call2", "call3"].includes(stage) ? 0.5 : 1;
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
    const gain = todayGains[stageId];
    msg += `  ${STAGE_LABELS[stageId] || stageId}: <b>${count}</b>${gain ? ` <i>+${gain}</i>` : ""}\n`;
  }

  msg += `\n🆕 <b>Нові сьогодні:</b> ${newToday.length}\n`;

  if (hotLeads.length > 0) {
    msg += `\n🔥 <b>Гарячі ліди (${hotLeads.length}):</b>\n`;
    for (const d of hotLeads.slice(0, 5))
      msg += `  • ${dName(d)} (${STAGE_LABELS[d.stage] || d.stage})\n`;
    if (hotLeads.length > 5) msg += `  ...і ще ${hotLeads.length - 5}\n`;
  }

  if (overdue.length > 0) {
    msg += `\n⚠️ <b>Прострочені дії (${overdue.length}):</b>\n`;
    for (const d of overdue.slice(0, 5))
      msg += `  • ${dName(d)} — ${d.nextActionDate}${d.nextActionTime ? ` ${d.nextActionTime}` : ""}\n`;
    if (overdue.length > 5) msg += `  ...і ще ${overdue.length - 5}\n`;
  } else {
    msg += `\n✅ Прострочених дій немає\n`;
  }

  if (stale.length > 0) {
    msg += `\n🧊 <b>Завис без дій 3+ дні:</b> ${stale.length}\n`;
  }

  // Productivity block (evening only)
  if (isPM) {
    const totalActions = stageChanges + newToday.length;
    const grade = productivityGrade(totalActions);

    // RingCentral call stats for Emma (ext. 106)
    const rcStats = await getEmmaCallStats();

    msg += `\n━━━━━━━━━━━━━━━━━━\n`;
    msg += `📈 <b>Продуктивність HR за день</b>\n`;
    msg += `  🔄 Змін стадій: <b>${Number.isInteger(stageChanges) ? stageChanges : stageChanges.toFixed(1)}</b>\n`;
    msg += `  🆕 Нових лідів: <b>${newToday.length}</b>\n`;
    msg += `  ───\n`;
    msg += `  Всього дій: <b>${Number.isInteger(totalActions) ? totalActions : totalActions.toFixed(1)}</b>\n`;
    msg += `  Оцінка: ${grade.icon} <b>${grade.label}</b>\n`;

    if (rcStats) {
      if (rcStats.error) {
        msg += `\n📱 <b>RingCentral error:</b> ${rcStats.error}\n`;
      } else {
        msg += `\n📱 <b>RingCentral — Emma (ext. 106)</b>\n`;
        msg += `  📞 Дзвінків за день: <b>${rcStats.callCount}</b>\n`;
        msg += `  ⏱ Час на лінії: <b>${rcStats.timeStr}</b>\n`;
        msg += `  📊 Середній дзвінок: <b>${rcStats.avgStr}</b>\n`;
      }
    }
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
