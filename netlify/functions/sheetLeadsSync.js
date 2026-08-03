// Manual sync endpoint for dispatcher leads from the Google Sheet.
// Idempotent: running it doesn't change anything unless the sheet has new leads
// the system hasn't seen yet. Accepts GET (for browser-based manual triggers)
// or POST. Admin token is optional — sync is a one-way safe operation.

import { getDb } from "./_auth.js";
import { fetchAllLeads, syncLeadsToFirestore } from "./_sheetLeads.js";

function json(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async () => {
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
