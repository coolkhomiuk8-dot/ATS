// Scheduled at 23:00 UTC = 07:00 PM Eastern Time (EDT, UTC-4), Mon–Fri.
// End-of-day call stats digest → owner's personal chat, with AI commentary
// and an explicit zero-activity flag for anyone who made no calls all day.

import { buildCallStatsMessage, sendToOwner } from "./_call-stats.js";

export const handler = async () => {
  const day = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" });
  if (day === "Sat" || day === "Sun") return { statusCode: 200, body: "Weekend — skipped" };

  const { msg, zeroActivity } = await buildCallStatsMessage({ title: "Дайджест дзвінків — кінець дня" });

  let fullMsg = msg;
  if (zeroActivity.length > 0) {
    fullMsg += `\n\n🔴 <b>Нуль дзвінків за весь день:</b>\n`;
    for (const s of zeroActivity) fullMsg += `  • ${s.name} (${s.account})\n`;
  }

  await sendToOwner(fullMsg.trimEnd());
  return { statusCode: 200, body: `Digest sent. ${zeroActivity.length} with zero activity.` };
};
