// Manual sync: pulls every load from Haulcar Pro and stores in Firestore.
// Triggered by the "📦 Sync Loads" button in the Loads view.
//
// Required env: HAULCAR_API_KEY

import { requireAdminOrRoot, getDb } from "./_auth.js";
import { fetchAllLoads, syncLoadsToFirestore } from "./_haulcar.js";

function json(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  try {
    await requireAdminOrRoot(event.headers.authorization || event.headers.Authorization);
  } catch (err) {
    return json(err.statusCode || 401, { error: err.message });
  }

  const apiKey = process.env.HAULCAR_API_KEY;
  if (!apiKey) {
    return json(500, { error: "HAULCAR_API_KEY env var not set on Netlify." });
  }

  const db = getDb();
  const t0 = Date.now();

  try {
    const { items, total } = await fetchAllLoads(apiKey, { pageSize: 200, maxItems: 5000 });
    const result = await syncLoadsToFirestore(db, items);
    return json(200, {
      success: true,
      fetched: items.length,
      apiTotal: total,
      report: result,
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    return json(500, { error: err.message || "Sync failed" });
  }
};
