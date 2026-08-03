// On-demand call stats, triggered internally by the main site's truck-bot.js
// /calls command (this function lives on its own Netlify site so its env-var
// footprint stays small — no Firebase/Samsara/Haulcar sharing the same
// AWS Lambda 4KB budget as both RingCentral accounts' credentials).

import { buildCallStatsMessage, sendToOwner } from "./_call-stats.js";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "ok" };

  try {
    const { msg } = await buildCallStatsMessage({ title: "Статистика дзвінків — зараз" });
    await sendToOwner(msg);
  } catch (e) {
    console.error("call-stats-oncall error:", e.message);
  }

  return { statusCode: 200, body: "ok" };
};
