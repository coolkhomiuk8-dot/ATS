// Free-text call-stats questions, triggered internally by the main site's
// truck-bot.js — non-command messages from the owner's personal chat, or
// @-mentions of the bot in the dispatch group chat, land here.

import { answerCallStatsQuestion, sendTelegramMessage, sendToOwner } from "./_call-stats.js";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "ok" };

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 200, body: "ok" }; }

  const question = (body.question || "").trim();
  if (!question) return { statusCode: 200, body: "ok" };

  try {
    const answer = await answerCallStatsQuestion(question);
    if (body.chatId) await sendTelegramMessage(body.chatId, `💬 ${answer}`);
    else await sendToOwner(`💬 ${answer}`);
  } catch (e) {
    console.error("call-stats-ask error:", e.message);
  }

  return { statusCode: 200, body: "ok" };
};
