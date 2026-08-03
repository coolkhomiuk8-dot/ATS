// Scheduled every 10 minutes — pulls loads from Haulcar Pro into Firestore.
// Runs unauthenticated (Netlify scheduled functions are server-side only).
//
// Required env: HAULCAR_API_KEY

import { withLambda } from "@netlify/aws-lambda-compat";
import { getDb } from "./_auth.js";
import { fetchAllLoads, syncLoadsToFirestore } from "./_haulcar.js";

export default withLambda(async () => {
  const apiKey = process.env.HAULCAR_API_KEY;
  if (!apiKey) {
    console.warn("[haulcarCron] HAULCAR_API_KEY not set — skipping.");
    return { statusCode: 200 };
  }

  const db = getDb();
  const t0 = Date.now();

  try {
    // 100 per page (API hard cap) · max 10000 — covers ~65 weeks at 150 loads/wk
    const { items, total } = await fetchAllLoads(apiKey, { pageSize: 100, maxItems: 10000 });
    const result = await syncLoadsToFirestore(db, items);
    console.log(
      `[haulcarCron] fetched=${items.length}/${total ?? "?"} written=${result.written} skipped=${result.skipped} errors=${result.errors.length} (${Date.now() - t0}ms)`
    );
    if (result.errors.length) console.error("[haulcarCron] errors:", result.errors);
  } catch (err) {
    console.error("[haulcarCron] Error:", err.message);
  }

  return { statusCode: 200 };
});
