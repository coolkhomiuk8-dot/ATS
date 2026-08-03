// On-demand call stats, triggered internally by truck-bot.js's /calls command.
//
// Split into its own function (rather than importing _call-stats.js directly
// in truck-bot.js) so this function's own env footprint stays small: it never
// touches Firestore, so it doesn't need FIREBASE_PRIVATE_KEY etc. alongside
// both RingCentral accounts' credentials in the same bundle.

import { withLambda } from "@netlify/aws-lambda-compat";
import { buildCallStatsMessage, sendToOwner } from "./_call-stats.js";

export default withLambda(async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "ok" };

  try {
    const { msg } = await buildCallStatsMessage({ title: "Статистика дзвінків — зараз" });
    await sendToOwner(msg);
  } catch (e) {
    console.error("call-stats-oncall error:", e.message);
  }

  return { statusCode: 200, body: "ok" };
});
