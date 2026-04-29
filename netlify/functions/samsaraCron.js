// Scheduled every 2 minutes.
// Pulls odometer, fault codes, fuel level, GPS and engine state from Samsara.
//
// Required env vars:
//   SAMSARA_API_KEY — Samsara API token (Settings → Developer → API Tokens)

import { getDb } from "./_auth.js";

const SAMSARA_BASE    = "https://api.samsara.com";
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

/**
 * Parse Samsara reverseGeo address → city, state only.
 * "123 Main St, Nashville, TN 37201, US" → "Nashville, TN"
 */
function parseCityState(formatted) {
  if (!formatted) return null;
  const parts = formatted.split(", ").filter((p) => p !== "US" && p !== "USA");
  if (parts.length < 2) return formatted;
  // parts[0] = street, parts[1] = city, parts[2] = "TN 37201" or "TN"
  const city  = parts[1] || "";
  const stateZip = parts[2] || "";
  const stateCode = stateZip.split(" ")[0]; // "TN" from "TN 37201"
  return stateCode ? `${city}, ${stateCode}` : city;
}

export const handler = async () => {
  const apiKey = process.env.SAMSARA_API_KEY;
  if (!apiKey) {
    console.warn("[samsaraCron] SAMSARA_API_KEY not set — skipping.");
    return { statusCode: 200 };
  }

  const db = getDb();

  try {
    // ── Fetch all stats from Samsara in parallel ────────────────────────────
    const [odomRows, faultRows, fuelRows, gpsRows, engineRows, vehicleRows] = await Promise.all([
      fetchAllStats("obdOdometerMeters", apiKey),
      fetchAllStats("faultCodes",        apiKey),
      fetchAllStats("fuelPercents",      apiKey),
      fetchAllStats("gps",               apiKey),
      fetchAllStats("engineStates",      apiKey),
      samsaraGet("/fleet/vehicles?limit=512", apiKey).then((r) => r.data || []),
    ]);

    // Build lookup maps by samsaraId
    const odomById   = Object.fromEntries(odomRows.map((v) => [v.id, v.obdOdometerMeters?.value ?? null]));
    const faultById  = Object.fromEntries(faultRows.map((v) => [v.id, v.faultCodes?.value || []]));
    const fuelById   = Object.fromEntries(fuelRows.map((v) => [v.id, v.fuelPercents?.value ?? null]));
    const engineById = Object.fromEntries(engineRows.map((v) => [v.id, v.engineStates?.value ?? null]));

    const gpsById = Object.fromEntries(gpsRows.map((v) => {
      const g = v.gps?.value;
      return [v.id, g ? {
        speed:    Math.round(g.speedMilesPerHour ?? 0),
        location: parseCityState(g.reverseGeo?.formattedLocation),
      } : null];
    }));

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
      const truck   = docSnap.data();
      let samsaraId = truck.samsaraId || null;

      if (!samsaraId && truck.vinNumber) {
        samsaraId = idByVin[String(truck.vinNumber).toUpperCase()] || null;
        if (samsaraId) autoLinked++;
      }

      if (!samsaraId) { noMatch++; continue; }

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

      await docSnap.ref.update(patch);
      synced++;
    }

    console.log(`[samsaraCron] synced=${synced} autoLinked=${autoLinked} noMatch=${noMatch}`);
  } catch (err) {
    console.error("[samsaraCron] Error:", err.message);
  }

  return { statusCode: 200 };
};
