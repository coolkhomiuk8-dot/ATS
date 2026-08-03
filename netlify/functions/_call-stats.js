// Shared builder for call-stats Telegram messages — used by the on-demand
// /calls command (truck-bot.js) and the scheduled digests.
//
// Required env vars: see _ringcentral.js for RC_* vars.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — sends to the owner's personal chat
//   ANTHROPIC_API_KEY (optional)         — enables the short AI commentary line

import { getAllTrackedCallStats } from "./_ringcentral.js";
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

function formatStatsMessage(stats, title) {
  if (stats.length === 0) {
    return (
      `📊 <b>${title}</b>\n\n` +
      `Немає налаштованих екстеншенів для відстеження. Задай RC_ACCOUNT1_EXTENSIONS / RC_ACCOUNT2_EXTENSIONS в env vars.`
    );
  }

  let msg = `📊 <b>${title}</b>\n\n`;

  const byAccount = new Map();
  for (const s of stats) {
    if (!byAccount.has(s.account)) byAccount.set(s.account, []);
    byAccount.get(s.account).push(s);
  }

  for (const [account, list] of byAccount) {
    msg += `<b>${account}:</b>\n`;
    for (const s of list) {
      if (s.error) {
        msg += `  ⚠️ ${s.name} — помилка: ${s.error}\n`;
      } else {
        const zeroFlag = s.callCount === 0 ? " ⚠️ нуль дзвінків" : "";
        msg += `  📞 <b>${s.name}</b>: ${s.callCount} дзвінків, ${s.timeStr} на лінії, сер. ${s.avgStr}${zeroFlag}\n`;
      }
    }
    msg += "\n";
  }

  const total = stats.filter((s) => !s.error).reduce((sum, s) => sum + s.callCount, 0);
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

export async function sendToOwner(text) {
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
