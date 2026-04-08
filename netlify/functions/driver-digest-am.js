// Runs daily at 06:00 UTC = 09:00 Kyiv time
// Sends morning driver analytics to HR group chat

import { buildDriverDigest, sendTelegramToHR } from "./_driver-analytics.js";

export const handler = async () => {
  const msg = await buildDriverDigest("Ранковий дайджест 🌅");
  await sendTelegramToHR(msg);
  return { statusCode: 200, body: "Morning digest sent" };
};
