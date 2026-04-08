// Runs daily at 12:00 UTC = 08:00 AM Eastern Time (EDT, UTC-4)
// Morning driver analytics → HR group chat (Mon–Fri only)

import { buildDriverDigest, sendTelegramToHR } from "./_driver-analytics.js";

export const handler = async () => {
  const day = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" });
  if (day === "Sat" || day === "Sun") return { statusCode: 200, body: "Weekend — skipped" };

  const msg = await buildDriverDigest("Ранковий дайджест 🌅", false);
  await sendTelegramToHR(msg);
  return { statusCode: 200, body: "Morning digest sent" };
};
