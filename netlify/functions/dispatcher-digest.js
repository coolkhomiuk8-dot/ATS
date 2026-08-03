// Scheduled daily at 06:00 UTC = 09:00 Kyiv time.
// Sends two things:
//   1. Stage breakdown (how many dispatchers at each stage)
//   2. Stale list — active dispatchers with no stage change in 2+ days
//
// Required env vars:
//   TELEGRAM_BOT_TOKEN   — token from @BotFather
//   TELEGRAM_CHAT_ID     — your personal chat ID

import { getDb } from "./_auth.js";

const STAGE_LABELS = {
  new_lead:    "🆕 New Lead",
  no_answer_1: "📵 Не додзвонився 1",
  no_answer_2: "📵 Не додзвонився 2",
  tg_sent:     "✉️ Написав в TG",
  in_comms:    "💬 Веду комунікацію",
  interview:   "🎯 Interview",
  on_hold:     "❄️ На паузі",
  rejected:    "❌ Rejected",
};

// Stages considered "active" for stale detection (not terminal)
const ACTIVE_STAGES = new Set(["new_lead", "no_answer_1", "no_answer_2", "tg_sent", "in_comms", "interview"]);

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

export const handler = async () => {
  const db = getDb();
  const snap = await db.collection("dispatchers").get();
  const dispatchers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const now = new Date();
  const dateStr = now.toLocaleDateString("uk-UA", { day: "numeric", month: "long", timeZone: "Europe/Kyiv" });

  // Stage breakdown
  const stageCounts = {};
  for (const d of dispatchers) {
    stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
  }

  let msg = `📊 <b>Дайджест диспетчерів — ${dateStr}</b>\n\n`;
  msg += `<b>По стадіях:</b>\n`;

  const stageOrder = ["new_lead", "no_answer_1", "no_answer_2", "tg_sent", "in_comms", "interview", "on_hold", "rejected"];
  for (const stageId of stageOrder) {
    const count = stageCounts[stageId];
    if (!count) continue;
    const label = STAGE_LABELS[stageId] || stageId;
    msg += `  ${label}: <b>${count}</b>\n`;
  }
  msg += `  ───\n  Всього: <b>${dispatchers.length}</b>\n`;

  // Stale dispatchers
  const stale = dispatchers
    .filter((d) => {
      if (!ACTIVE_STAGES.has(d.stage)) return false;
      const lastChange = d.stageChangedAt
        ? new Date(d.stageChangedAt)
        : new Date(d.createdAt || 0);
      return (now - lastChange) / (1000 * 60 * 60 * 24) >= 2;
    })
    .sort((a, b) => {
      const aTime = new Date(a.stageChangedAt || a.createdAt || 0);
      const bTime = new Date(b.stageChangedAt || b.createdAt || 0);
      return aTime - bTime; // oldest first
    });

  if (stale.length > 0) {
    msg += `\n⚠️ <b>Завис без дій (2+ дні):</b>\n`;
    for (const d of stale) {
      const lastChange = d.stageChangedAt
        ? new Date(d.stageChangedAt)
        : new Date(d.createdAt || 0);
      const days = Math.floor((now - lastChange) / (1000 * 60 * 60 * 24));
      const label = STAGE_LABELS[d.stage] || d.stage;
      msg += `  • <b>${d.name || "—"}</b> — ${days}д (${label})\n`;
    }
  } else {
    msg += `\n✅ Немає завислих кандидатів`;
  }

  await sendTelegram(msg);

  return { statusCode: 200, body: `Digest sent. ${stale.length} stale dispatchers.` };
};
