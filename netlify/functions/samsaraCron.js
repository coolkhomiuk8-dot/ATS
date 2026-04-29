// Scheduled every 10 minutes.
// Pulls odometer + fault codes from Samsara and updates Firestore trucks.
//
// Required env vars:
//   SAMSARA_API_KEY — Samsara API token (Settings → Developer → API Tokens)

import { getDb } from "./_auth.js";

const SAMSARA_BASE   = "https://api.samsara.com";
const METERS_TO_MILES = 0.000621371;

async function samsaraGet(path, apiKey) {
  const res = await fetch(`${SAMSARA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Samsara ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchAllStats(type, apiKey) {
  let results = [];
  let cursor  = null;
  do {
    const qs   = `types=${type}&limit=512${cursor ? `&after=${cursor}` : ""}`;
    const page = await samsaraGet(`/fleet/vehicles/stats?${qs}`, apiKey);
    results = results.concat(page.data || []);
    cursor  = page.pagination?.hasNextPage ? page.pagination.endCursor : null;
  } while (cursor);
  return results;
}

export const handler = async () => {
  const apiKey = process.env.SAMSARA_API_KEY;
  if (!apiKey) {
    console.warn("[samsaraCron] SAMSARA_API_KEY not set — skipping.");
    return { statusCode: 200 };
  }

  const db = getDb();

  try {
    // ── Fetch from Samsara ──────────────────────────────────────────────────
    const [odomRows, faultRows, vehicleRows] = await Promise.all([
      fetchAllStats("obdOdometerMeters", apiKey),
      fetchAllStats("faultCodes",        apiKey),
      samsaraGet("/fleet/vehicles?limit=512", apiKey).then((r) => r.data || []),
    ]);

    const odomById  = Object.fromEntries(
      odomRows.map((v) => [v.id, v.obdOdometerMeters?.value ?? null])
    );
    const faultById = Object.fromEntries(
      faultRows.map((v) => [v.id, v.faultCodes?.value || []])
    );
    // VIN → samsaraId for auto-linking
    const idByVin = Object.fromEntries(
      vehicleRows
        .filter((v) => v.externalIds?.["samsara.vin"] || v.vin)
        .map((v) => [(v.externalIds?.["samsara.vin"] || v.vin || "").toUpperCase(), v.id])
    );

    // ── Update Firestore ────────────────────────────────────────────────────
    const trucksSnap = await db.collection("trucks").get();
    const now        = new Date().toISOString();
    let synced = 0, autoLinked = 0, noMatch = 0;

    for (const docSnap of trucksSnap.docs) {
      const truck     = docSnap.data();
      let samsaraId   = truck.samsaraId || null;

      if (!samsaraId && truck.vinNumber) {
        samsaraId = idByVin[String(truck.vinNumber).toUpperCase()] || null;
        if (samsaraId) autoLinked++;
      }

      if (!samsaraId) { noMatch++; continue; }

      const odomMeters = odomById[samsaraId];
      const faultCodes = faultById[samsaraId] || [];

      const patch = { samsaraId, lastSamsaraSync: now, faultCodes };
      if (odomMeters != null) {
        patch.currentOdometer = Math.round(odomMeters * METERS_TO_MILES);
      }

      await docSnap.ref.update(patch);
      synced++;
    }

    console.log(`[samsaraCron] synced=${synced} autoLinked=${autoLinked} noMatch=${noMatch}`);
  } catch (err) {
    console.error("[samsaraCron] Error:", err.message);
  }

  return { statusCode: 200 };
};
