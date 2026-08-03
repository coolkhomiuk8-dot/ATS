// Manual trigger — open GET. Same code path as the scheduled digest, useful
// for testing changes to thresholds or message format without waiting until
// 9 AM Kyiv tomorrow.

import { getDb } from "./_auth.js";
import { buildAndSend, buildStaleBuckets, formatDigest } from "./_dispatcherStale.js";

function json(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body, null, 2),
  };
}

export const handler = async (event) => {
  const dryRun = (event.queryStringParameters || {}).dry === "1";
  try {
    const db = getDb();
    if (dryRun) {
      const buckets = await buildStaleBuckets(db);
      const preview = formatDigest(buckets);
      return json(200, { dryRun: true, total: buckets.total, preview });
    }
    const result = await buildAndSend(db);
    return json(200, result);
  } catch (err) {
    return json(500, { error: err.message });
  }
};
