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

  function parseCityState(formatted) {
    if (!formatted) return null;
    const parts = formatted.split(", ").filter((p) => p !== "US" && p !== "USA");
    if (parts.length < 2) return formatted;
    const city = parts[1] || "";
    const stateCode = (parts[2] || "").split(" ")[0];
    return stateCode ? `${city}, ${stateCode}` : city;
  }

  // ── Fetch all stats from Samsara in parallel ──────────────────────────────
  const [odomRows, faultRows, fuelRows, gpsRows, engineRows, vehicleRows] = await Promise.all([
    fetchAllStats("obdOdometerMeters", apiKey),
    fetchAllStats("faultCodes",        apiKey),
    fetchAllStats("fuelPercents",      apiKey),
    fetchAllStats("gps",               apiKey),
    fetchAllStats("engineStates",      apiKey),
    samsaraGet("/fleet/vehicles?limit=512", apiKey).then((r) => r.data || []),
  ]);

  // Build lookup maps keyed by samsaraId
  const odomById   = Object.fromEntries(odomRows.map((v) => [v.id, v.obdOdometerMeters?.value ?? null]));
  const faultById  = Object.fromEntries(faultRows.map((v) => [v.id, v.faultCodes?.value || []]));
  const fuelById   = Object.fromEntries(fuelRows.map((v) => [v.id, v.fuelPercents?.value ?? null]));
  const engineById = Object.fromEntries(engineRows.map((v) => [v.id, v.engineStates?.value ?? null]));
  const gpsById    = Object.fromEntries(gpsRows.map((v) => {
    const g = v.gps?.value;
    return [v.id, g ? { speed: Math.round(g.speedMilesPerHour ?? 0), location: parseCityState(g.reverseGeo?.formattedLocation) } : null];
  }));
  // VIN → samsaraId (for auto-linking)
  const idByVin = Object.fromEntries(
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

    const patch = {
      samsaraId,
      lastSamsaraSync: now,
      faultCodes:  faultById[samsaraId]  || [],
      fuelPercent: fuelById[samsaraId]   ?? null,
      engineState: engineById[samsaraId] ?? null,
      gpsData:     gpsById[samsaraId]    ?? null,
    };

    const odomMeters = odomById[samsaraId];
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
