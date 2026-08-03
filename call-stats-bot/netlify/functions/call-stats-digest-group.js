// Scheduled at 22:00 UTC = 18:00 PM Eastern Time (EDT, UTC-4), Mon–Fri.
// Same call-stats digest as the owner's EOD digest, but posted to the
// dispatch team's group chat instead — visible to everyone there.

import { buildCallStatsMessage, sendTelegramMessage } from "./_call-stats.js";

export const handler = async () => {
  const chatId = process.env.TELEGRAM_DISPATCH_CHAT_ID;
  if (!chatId) return { statusCode: 200, body: "TELEGRAM_DISPATCH_CHAT_ID not set — skipping" };

  const day = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" });
  if (day === "Sat" || day === "Sun") return { statusCode: 200, body: "Weekend — skipped" };

  const { msg } = await buildCallStatsMessage({ title: "Статистика дзвінків — команда" });
  await sendTelegramMessage(chatId, msg);

  return { statusCode: 200, body: "Group digest sent" };
};
