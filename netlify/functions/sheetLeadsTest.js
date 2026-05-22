// One-shot test: re-send 3 sample leads to the leads chat to verify
// the new outreach template + chat routing.

import { getDb } from "./_auth.js";

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildOutreachTemplate() {
  return [
    "Доброго дня 👋",
    "Це Тетяна, HR-менеджер компанії 212 Expedite. Надсилаю вам посилання на тест для визначення рівня англійської мови, ви відгукувались на нашу вакансію диспетчера.",
    "",
    "🔗 Ваш тест тут: https://www.efset.org/quick-check/",
    "Тривалість близько 15 хвилин.",
    "",
    "Абсолютно безкоштовно та без потреби реєстрації.",
    "Обов'язково зробіть скріншот екрана з вашим фінальним результатом (на фото має бути чітко видно ваш бал та рівень CEFR).",
    "",
    "Як тільки отримаю ваш результат — одразу повернуся зі зворотним зв'язком щодо наших наступних кроків.",
    "",
    "Успіхів! Якщо виникнуть технічні питання — пишіть.",
  ].join("\n");
}

function buildLeadKeyboard(lead) {
  const text = encodeURIComponent(buildOutreachTemplate());
  const tgRaw = String(lead.telegram || "").trim();
  const tgClean = tgRaw.replace(/^@/, "");
  if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(tgClean)) {
    return { inline_keyboard: [[{ text: "✍️ Написати в Telegram", url: `https://t.me/${tgClean}?text=${text}` }]] };
  }
  if (lead.phone) {
    const phoneClean = String(lead.phone).replace(/[^\d]/g, "");
    if (phoneClean.length >= 7) {
      return { inline_keyboard: [[{ text: "💬 Telegram (по номеру)", url: `tg://resolve?phone=${phoneClean}&text=${text}` }]] };
    }
  }
  return null;
}

function buildLeadMessage(lead) {
  const lines = [`🧪 <b>ТЕСТ — Новий лід — ${escapeHtml(lead.role)}</b>`, ""];
  lines.push(`👤 <b>${escapeHtml(lead.name || "(no name)")}</b>`);
  if (lead.phone) lines.push(`📞 <a href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a>`);
  if (lead.telegram) {
    const tg = lead.telegram.replace(/^@/, "");
    if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(tg)) {
      lines.push(`📱 Telegram: <a href="https://t.me/${tg}">@${escapeHtml(tg)}</a>`);
    } else {
      lines.push(`📱 Telegram: ${escapeHtml(lead.telegram)}`);
    }
  }
  if (lead.englishLevel) lines.push(`🇬🇧 English: <b>${escapeHtml(lead.englishLevel)}</b>`);
  if (lead.campaign)     lines.push(`📺 Кампанія: ${escapeHtml(lead.campaign)}`);
  return lines.join("\n");
}

async function send(text, reply_markup) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_LEADS_CHAT_ID || process.env.TELEGRAM_HR_CHAT_ID;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text, parse_mode: "HTML",
      disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}),
    }),
  });
  return { ok: res.ok, status: res.status };
}

export const handler = async () => {
  const db = getDb();
  const snap = await db.collection("dispatchers").where("source", "==", "meta_ads").limit(3).get();
  const results = [];
  for (const doc of snap.docs) {
    const lead = doc.data();
    const r = await send(buildLeadMessage(lead), buildLeadKeyboard(lead));
    results.push({ id: doc.id, name: lead.name, telegram: lead.telegram, ok: r.ok });
    await new Promise((res) => setTimeout(res, 3500));
  }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(results, null, 2) };
};
