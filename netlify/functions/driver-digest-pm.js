// Runs daily at 22:00 UTC = 06:00 PM Eastern Time (EDT, UTC-4)
// Evening driver analytics + HR productivity score → HR group chat

import { buildDriverDigest, sendTelegramToHR } from "./_driver-analytics.js";

export const handler = async () => {
  const msg = await buildDriverDigest("Вечірній підсумок 🌆", true);
  await sendTelegramToHR(msg);
  return { statusCode: 200, body: "Evening digest sent" };
};
