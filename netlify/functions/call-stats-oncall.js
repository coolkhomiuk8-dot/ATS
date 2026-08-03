// On-demand call stats, triggered internally by truck-bot.js's /calls command.
//
// Split into its own function (rather than importing _call-stats.js directly
// in truck-bot.js) so this function's own env footprint stays small: it never
// touches Firestore, so it doesn't need FIREBASE_PRIVATE_KEY etc. alongside
// both RingCentral accounts' credentials in the same bundle.
//
// Native modern Functions signature (Request/Response) — no Lambda-compat
// shim at all, to rule out AWS Lambda's 4KB env limit for this function.

import { buildCallStatsMessage, sendToOwner } from "./_call-stats.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("ok");

  try {
    const { msg } = await buildCallStatsMessage({ title: "Статистика дзвінків — зараз" });
    await sendToOwner(msg);
  } catch (e) {
    console.error("call-stats-oncall error:", e.message);
  }

  return new Response("ok");
};
