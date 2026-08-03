// Scheduled every 30 minutes.
// Checks for dispatchers with nextActionDate/nextActionTime falling within the next 30 minutes
// and sends a Telegram reminder.
//
// Required env vars:
//   TELEGRAM_BOT_TOKEN   — token from @BotFather
//   TELEGRAM_CHAT_ID     — your personal chat ID (get it from @userinfobot)

import { getDb } from "./_auth.js";

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
  const in30 = new Date(now.getTime() + 30 * 60 * 1000);

  const due = dispatchers.filter((d) => {
    if (!d.nextActionDate || !d.nextActionTime) return false;
    const dt = new Date(`${d.nextActionDate}T${d.nextActionTime}:00`);
    return dt >= now && dt <= in30;
  });

  for (const d of due) {
    const tg = d.telegram ? `@${d.telegram.replace(/^@/, "")}` : "—";
    const phone = d.phone || "—";
    const msg =
      `⏰ <b>Нагадування про контакт</b>\n\n` +
      `👤 <b>${d.name || "—"}</b>\n` +
      `📅 ${d.nextActionDate} о ${d.nextActionTime}\n` +
      `📍 Стадія: ${d.stage}\n` +
      (d.telegram ? `💬 TG: ${tg}\n` : "") +
      (d.phone ? `📞 ${phone}` : "");
    await sendTelegram(msg);
  }

  return { statusCode: 200, body: `Checked ${dispatchers.length} dispatchers, sent ${due.length} reminders` };
};
