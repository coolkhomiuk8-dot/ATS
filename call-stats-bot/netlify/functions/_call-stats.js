// Shared builder for call-stats Telegram messages — used by the on-demand
// /calls command (truck-bot.js) and the scheduled digests.
//
// Required env vars: see _ringcentral.js for RC_* vars.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — sends to the owner's personal chat
//   ANTHROPIC_API_KEY (optional)         — enables the short AI commentary line

import { getAllTrackedCallStats, getTodayAndYesterdayStats } from "./_ringcentral.js";
import Anthropic from "@anthropic-ai/sdk";

async function getAICommentary(stats) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const ok = stats.filter((s) => !s.error);
  if (ok.length === 0) return null;

  const summary = ok
    .map((s) => `${s.name}: ${s.callCount} дзвінків, ${s.timeStr} на лінії, середній дзвінок ${s.avgStr}`)
    .join("\n");

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content:
            `Ти — асистент диспетчерської компанії, аналізуєш денну статистику дзвінків команди.\n` +
            `Дай ОДНЕ коротке речення українською (розмовне, без зайвої води) — коментар або порада на основі цих цифр.\n` +
            `Якщо хтось явно відстає від інших — зауваж це прямо, по імені.\n\n${summary}`,
        },
      ],
    });
    return res.content.find((b) => b.type === "text")?.text?.trim() || null;
  } catch (e) {
    console.error("Claude commentary error:", e.message);
    return null;
  }
}

// Traffic light relative to that account's own average — a flat threshold
// doesn't work when accounts range from 2 calls to 107 calls in the same day.
function trafficLight(callCount, avg) {
  if (avg <= 0) return "📞";
  if (callCount >= avg * 1.25) return "🟢";
  if (callCount >= avg * 0.75) return "🟡";
  return "🟠";
}

function formatStatsMessage(stats, title) {
  if (stats.length === 0) {
    return (
      `📊 <b>${title}</b>\n\n` +
      `Немає налаштованих екстеншенів для відстеження. Задай RC_ACCOUNT1_EXTENSIONS / RC_ACCOUNT2_EXTENSIONS в env vars.`
    );
  }

  const byAccount = new Map();
  for (const s of stats) {
    if (!byAccount.has(s.account)) byAccount.set(s.account, []);
    byAccount.get(s.account).push(s);
  }

  const ok = stats.filter((s) => !s.error);
  const active = ok.filter((s) => s.callCount > 0);
  const zero = ok.filter((s) => s.callCount === 0);
  const top = ok.reduce((best, s) => (!best || s.callCount > best.callCount ? s : best), null);

  let msg = `📊 <b>${title}</b>\n`;
  if (ok.length > 0) {
    msg += `✅ ${active.length}/${ok.length} активні`;
    if (top && top.callCount > 0) msg += ` · 🏆 ${top.name} (${top.callCount})`;
    if (zero.length > 0) msg += ` · ⚠️ ${zero.length} нулів`;
    msg += `\n`;
  }
  msg += `<i>(+N/2г = дзвінків за останні 2 год)</i>\n\n`;

  for (const [account, list] of byAccount) {
    const nonError = list.filter((s) => !s.error);
    const avg = nonError.length > 0 ? nonError.reduce((sum, s) => sum + s.callCount, 0) / nonError.length : 0;

    msg += `<b>${account}:</b>\n`;
    for (const s of list) {
      if (s.error) {
        msg += `  ⚠️ ${s.name} — помилка: ${s.error}\n`;
      } else if (s.callCount === 0) {
        msg += `  ⚠️ <b>${s.name}</b> — 0 дзвінків\n`;
      } else {
        const dot = trafficLight(s.callCount, avg);
        msg += `  ${dot} <b>${s.name}</b> — <b>${s.callCount}</b> (+${s.recentCount}/2г) · ${s.timeStr}\n`;
      }
    }
    msg += "\n";
  }

  const total = ok.reduce((sum, s) => sum + s.callCount, 0);
  msg += `───\nВсього дзвінків: <b>${total}</b>`;

  return msg.trimEnd();
}

// Fetches stats, formats the message, and (optionally) appends a short AI commentary.
// Returns { msg, stats, zeroActivity } — zeroActivity is the list of extensions with 0 calls today.
export async function buildCallStatsMessage({ title = "Статистика дзвінків", withCommentary = true } = {}) {
  const stats = await getAllTrackedCallStats();
  let msg = formatStatsMessage(stats, title);

  if (withCommentary && stats.length > 0) {
    const commentary = await getAICommentary(stats);
    if (commentary) msg += `\n\n💭 ${commentary}`;
  }

  const zeroActivity = stats.filter((s) => !s.error && s.callCount === 0);
  return { msg, stats, zeroActivity };
}

// Free-text Q&A — the owner can just ask ("скільки дзвінків вчора у Andrew?")
// instead of only reading the standard digest. Answers strictly from
// today's/yesterday's tracked call stats, not general knowledge.
export async function answerCallStatsQuestion(question) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return "AI-відповіді вимкнені — не задано ANTHROPIC_API_KEY.";
  }

  const { today, yesterday } = await getTodayAndYesterdayStats();
  const fmt = (rows) =>
    rows
      .filter((s) => !s.error)
      .map((s) => `${s.name} (${s.account}): ${s.callCount} дзвінків, ${s.timeStr} на лінії`)
      .join("\n") || "(немає даних)";

  const context = `СЬОГОДНІ:\n${fmt(today)}\n\nВЧОРА:\n${fmt(yesterday)}`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content:
            `Ти — асистент диспетчерської компанії. Нижче — дані про дзвінки команди за сьогодні й учора.\n` +
            `Відповідай КОРОТКО, українською, спираючись лише на ці дані. Якщо даних для відповіді немає — так і скажи, не вигадуй.\n` +
            `Це піде в Telegram з parse_mode=HTML: НЕ використовуй markdown (**, __, \`\`\`) — якщо треба виділити щось, ` +
            `використовуй HTML-теги <b>...</b> або взагалі без форматування.\n\n` +
            `${context}\n\nПИТАННЯ: ${question}`,
        },
      ],
    });
    return res.content.find((b) => b.type === "text")?.text?.trim() || "Не вдалося отримати відповідь.";
  } catch (e) {
    console.error("Claude Q&A error:", e.message);
    return `Помилка при зверненні до AI: ${e.message}`;
  }
}

// Sends to an explicit chat — used when the request (via truck-bot.js) tells
// us which chat asked, so a group chat gets its answer back in that group,
// not always in the owner's personal chat.
export async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) throw new Error("Missing TELEGRAM_BOT_TOKEN or chatId");

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

// Scheduled digests (midday/EOD) always go to the owner's own chat.
export async function sendToOwner(text) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Missing TELEGRAM_CHAT_ID");
  return sendTelegramMessage(chatId, text);
}
