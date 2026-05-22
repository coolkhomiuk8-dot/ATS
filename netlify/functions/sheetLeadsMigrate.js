// ONE-TIME: backfill notifiedAt on already-notified leads from the first sync,
// so the next cron doesn't send duplicate Telegram messages.
// Leaves the 10 known-failed leads (Telegram 429) with notifiedAt=null so they
// retry naturally.

import { getDb } from "./_auth.js";

// IDs that failed Telegram delivery in the very first sync — these should NOT
// be marked as notified, so the next cron retries them.
const FAILED_IDS = new Set([
  "lead_l_946186141481804",
  "lead_l_2508686502884915",
  "lead_l_2144790019677572",
  "lead_l_2010052706390074",
  "lead_l_972596441885088",
  "lead_l_964701196420478",
  "lead_l_1937436750311337",
  "lead_l_1677248696637373",
  "lead_l_1276875744430849",
  "lead_l_1496225631984792",
]);

export const handler = async () => {
  const db = getDb();
  const t0 = Date.now();

  // Find all meta_ads leads with no notifiedAt set
  const snap = await db.collection("dispatchers").where("source", "==", "meta_ads").get();
  let marked = 0, skipped = 0;

  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    if (FAILED_IDS.has(doc.id)) { skipped++; continue; }
    const data = doc.data();
    if (data.notifiedAt) { skipped++; continue; }
    batch.update(doc.ref, { notifiedAt: new Date().toISOString() + "_backfill" });
    count++;
    marked++;
    if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  if (count > 0) await batch.commit();

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      marked,
      skippedFailed: FAILED_IDS.size,
      skippedOther: skipped - FAILED_IDS.size,
      elapsedMs: Date.now() - t0,
    }),
  };
};
