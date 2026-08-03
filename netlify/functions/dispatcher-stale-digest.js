// Daily 9:00 Europe/Kyiv (= 06:00 UTC year-round; close enough across DST).
// Pushes a single message into the leads chat listing dispatchers stalled
// in their current stage beyond the per-stage threshold.

import { withLambda } from "@netlify/aws-lambda-compat";
import { getDb } from "./_auth.js";
import { buildAndSend } from "./_dispatcherStale.js";

export default withLambda(async () => {
  const t0 = Date.now();
  try {
    const db = getDb();
    const result = await buildAndSend(db);
    console.log(
      `[dispatcher-stale-digest] sent=${result.sent} total=${result.total ?? 0} (${Date.now() - t0}ms)`,
      result.reason ? `reason=${result.reason}` : "",
    );
  } catch (err) {
    console.error("[dispatcher-stale-digest] Error:", err.message);
  }
  return { statusCode: 200 };
});
