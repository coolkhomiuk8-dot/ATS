// Scheduled at 16:00 UTC = 12:00 PM Eastern Time (EDT, UTC-4), Mon–Fri.
// Mid-day nudge: if anyone tracked still has 0 calls by lunchtime, ping the owner.
// Stays silent if everyone already has activity — no need to spam a good day.

import { withLambda } from "@netlify/aws-lambda-compat";
import { buildCallStatsMessage, sendToOwner } from "./_call-stats.js";

export default withLambda(async () => {
  const day = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" });
  if (day === "Sat" || day === "Sun") return { statusCode: 200, body: "Weekend — skipped" };

  const { zeroActivity } = await buildCallStatsMessage({ withCommentary: false });
  if (zeroActivity.length === 0) {
    return { statusCode: 200, body: "Everyone has activity — no nudge sent" };
  }

  let msg = `⏰ <b>Нуль дзвінків до обіду</b>\n\n`;
  for (const s of zeroActivity) {
    msg += `  ⚠️ <b>${s.name}</b> (${s.account}) — ще 0 дзвінків\n`;
  }
  await sendToOwner(msg.trimEnd());

  return { statusCode: 200, body: `Nudge sent for ${zeroActivity.length} extension(s)` };
});
