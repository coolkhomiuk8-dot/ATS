import { requireAdminOrRoot, getDb } from "./_auth.js";

const SAMSARA_BASE = "https://api.samsara.com";
const METERS_TO_MILES = 0.000621371;

function json(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

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

/**
 * Fetch all pages of a paginated Samsara stats endpoint.
 * Returns the merged data[] array.
 */
async function fetchAllStats(type, apiKey) {
  let results = [];
  let cursor = null;
  do {
    const qs = `types=${type}&limit=512${cursor ? `&after=${cursor}` : ""}`;
    const page = await samsaraGet(`/fleet/vehicles/stats?${qs}`, apiKey);
    results = results.concat(page.data || []);
    cursor = page.pagination?.endCursor && page.pagination?.hasNextPage
      ? page.pagination.endCursor
      : null;
  } while (cursor);
  return results;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  try {
    await requireAdminOrRoot(event.headers.authorization || event.headers.Authorization);
  } catch (err) {
    return json(err.statusCode || 401, { error: err.message });
  }

  const apiKey = process.env.SAMSARA_API_KEY;
  if (!apiKey) return json(500, { error: "SAMSARA_API_KEY env var not set." });

  const db = getDb();

  // ── Fetch odometer + fault codes from Samsara in parallel ────────────────
  const [odomRows, faultRows, vehicleRows] = await Promise.all([
    fetchAllStats("obdOdometerMeters", apiKey),
    fetchAllStats("faultCodes",        apiKey),
    // Also fetch vehicle list for VIN-based auto-matching
    samsaraGet("/fleet/vehicles?limit=512", apiKey).then((r) => r.data || []),
  ]);

  // Build lookup maps keyed by samsaraId
  const odomById  = Object.fromEntries(
    odomRows.map((v) => [v.id, v.obdOdometerMeters?.value ?? null])
  );
  const faultById = Object.fromEntries(
    faultRows.map((v) => [v.id, v.faultCodes || []])
  );
  // VIN → samsaraId (for auto-linking)
  const idByVin   = Object.fromEntries(
    vehicleRows
      .filter((v) => v.externalIds?.["samsara.vin"] || v.vin)
      .map((v) => [(v.externalIds?.["samsara.vin"] || v.vin || "").toUpperCase(), v.id])
  );

  // ── Iterate Firestore trucks ──────────────────────────────────────────────
  const trucksSnap = await db.collection("trucks").get();
  const now = new Date().toISOString();
  const report = { synced: 0, autoLinked: 0, noMatch: 0, errors: [] };

  for (const docSnap of trucksSnap.docs) {
    const truck = docSnap.data();
    let samsaraId = truck.samsaraId || null;

    // Auto-link by VIN if not yet linked
    if (!samsaraId && truck.vinNumber) {
      samsaraId = idByVin[String(truck.vinNumber).toUpperCase()] || null;
      if (samsaraId) report.autoLinked++;
    }

    if (!samsaraId) { report.noMatch++; continue; }

    const odomMeters = odomById[samsaraId];
    const faultCodes = faultById[samsaraId] || [];

    const patch = {
      samsaraId,
      lastSamsaraSync: now,
      faultCodes,
    };

    // Only update odometer if Samsara has a value
    if (odomMeters != null) {
      patch.currentOdometer = Math.round(odomMeters * METERS_TO_MILES);
    }

    try {
      await db.collection("trucks").doc(docSnap.id).update(patch);
      report.synced++;
    } catch (err) {
      report.errors.push(`Unit ${truck.unitNumber || docSnap.id}: ${err.message}`);
    }
  }

  return json(200, { success: true, report });
};
