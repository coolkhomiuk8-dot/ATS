// Manual sync endpoint for dispatcher leads from the Google Sheet.
// Triggered by a button in the dispatchers view. Requires admin auth.

import { requireAdminOrRoot, getDb } from "./_auth.js";
import { fetchAllLeads, syncLeadsToFirestore } from "./_sheetLeads.js";

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

  const t0 = Date.now();
  try {
    const leads = await fetchAllLeads();
    const db = getDb();
    const report = await syncLeadsToFirestore(db, leads);
    return json(200, {
      success: true,
      fetched: leads.length,
      report,
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    return json(500, { error: err.message || "Sync failed" });
  }
};
