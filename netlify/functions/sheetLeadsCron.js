// Scheduled every 15 minutes — pulls dispatcher leads from the Google Sheet
// into Firestore. Runs unauthenticated (Netlify scheduled functions are
// server-side only).

import { getDb } from "./_auth.js";
import { fetchAllLeads, syncLeadsToFirestore } from "./_sheetLeads.js";

export const handler = async () => {
  const t0 = Date.now();
  try {
    const leads = await fetchAllLeads();
    const db = getDb();
    const report = await syncLeadsToFirestore(db, leads);
    console.log(
      `[sheetLeadsCron] fetched=${leads.length} written=${report.written} skipped=${report.skipped} notified=${report.notified} errors=${report.errors.length} (${Date.now() - t0}ms)`
    );
    if (report.errors.length) console.error("[sheetLeadsCron] errors:", report.errors);
  } catch (err) {
    console.error("[sheetLeadsCron] Error:", err.message);
  }
  return { statusCode: 200 };
};
