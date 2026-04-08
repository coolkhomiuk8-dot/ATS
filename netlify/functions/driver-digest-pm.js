// Runs daily at 15:00 UTC = 18:00 Kyiv time
// Sends evening driver analytics to HR group chat

import { buildDriverDigest, sendTelegramToHR } from "./_driver-analytics.js";

export const handler = async () => {
  const msg = await buildDriverDigest("Вечірній підсумок 🌆");
  await sendTelegramToHR(msg);
  return { statusCode: 200, body: "Evening digest sent" };
};
