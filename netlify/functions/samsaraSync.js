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
  const apiErrors = [];
  const safe = (label, p) => p.catch((e) => {
    apiErrors.push(`${label}: ${e.message || e}`);
    return [];
  });

  async function fetchLocations() {
    const r = await samsaraGet("/fleet/vehicles/locations?limit=512", apiKey);
    return r.data || [];
  }

  const [odomRows, gpsOdomRows, faultRows, fuelRows, gpsRows, engineRows, vehicleRows, locationRows] = await Promise.all([
    safe("obdOdometerMeters", fetchAllStats("obdOdometerMeters", apiKey)),
    safe("gpsOdometerMeters", fetchAllStats("gpsOdometerMeters", apiKey)),
    safe("faultCodes",        fetchAllStats("faultCodes",        apiKey)),
    safe("fuelPercents",      fetchAllStats("fuelPercents",      apiKey)),
    safe("gps",               fetchAllStats("gps",               apiKey)),
    safe("engineStates",      fetchAllStats("engineStates",      apiKey)),
    safe("vehicles",          samsaraGet("/fleet/vehicles?limit=512", apiKey).then((r) => r.data || [])),
    safe("locations",         fetchLocations()),
  ]);

  // Build lookup maps keyed by samsaraId
  // Odometer: prefer OBD, fall back to GPS-based
  const obdOdomById = Object.fromEntries(odomRows.map((v) => [v.id, v.obdOdometerMeters?.value ?? null]));
  const gpsOdomById = Object.fromEntries(gpsOdomRows.map((v) => [v.id, v.gpsOdometerMeters?.value ?? null]));
  const odomById = new Proxy({}, {
    get: (_, id) => obdOdomById[id] ?? gpsOdomById[id] ?? undefined,
  });
  const faultById  = Object.fromEntries(faultRows.map((v) => [v.id, v.faultCodes?.value || []]));
  const fuelById   = Object.fromEntries(fuelRows.map((v) => [v.id, v.fuelPercents?.value ?? null]));
  const engineById = Object.fromEntries(engineRows.map((v) => [v.id, v.engineStates?.value ?? null]));

  // GPS: prefer dedicated locations endpoint, fall back to gps stat
  const locById = Object.fromEntries(locationRows.map((v) => {
    const loc = v.location;
    return [v.id, loc ? {
      speed:    Math.round(loc.speed ?? loc.speedMilesPerHour ?? 0),
      location: parseCityState(loc.reverseGeo?.formattedLocation),
    } : null];
  }));
  const gpsStatById = Object.fromEntries(gpsRows.map((v) => {
    const g = v.gps?.value;
    return [v.id, g ? { speed: Math.round(g.speedMilesPerHour ?? 0), location: parseCityState(g.reverseGeo?.formattedLocation) } : null];
  }));
  const gpsById = new Proxy({}, {
    get: (_, id) => locById[id] ?? gpsStatById[id] ?? undefined,
  });
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

    let rawFuel       = fuelById[samsaraId]   ?? null;
    let rawEngine     = engineById[samsaraId] ?? null;
    const rawGps      = gpsById[samsaraId]    ?? null;
    const rawOdom     = odomById[samsaraId];
    let rawFuelTime   = null;
    let rawEngineTime = null;

    // Capture timestamps for live values (so we know how fresh they are)
    const liveFuelRow   = fuelRows.find((v) => String(v.id) === String(samsaraId));
    const liveEngineRow = engineRows.find((v) => String(v.id) === String(samsaraId));
    if (liveFuelRow?.fuelPercents?.time)     rawFuelTime   = liveFuelRow.fuelPercents.time;
    if (liveEngineRow?.engineStates?.time)   rawEngineTime = liveEngineRow.engineStates.time;

    // ── History fallback: only look back 1 hour to avoid stale data ─────────
    if (rawFuel == null || rawEngine == null) {
      const endTime   = new Date().toISOString();
      const startTime = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
      const hist = await samsaraGet(
        `/fleet/vehicles/stats/history?types=fuelPercents,engineStates&vehicleIds=${samsaraId}&startTime=${startTime}&endTime=${endTime}`,
        apiKey
      ).catch(() => ({ data: [] }));

      const hv = (hist.data || [])[0] || {};

      if (rawFuel == null) {
        const pts = hv.fuelPercents || [];
        const last = pts[pts.length - 1];
        if (last?.value != null) {
          rawFuel     = last.value;
          rawFuelTime = last.time;
        }
      }
      if (rawEngine == null) {
        const pts = hv.engineStates || [];
        const last = pts[pts.length - 1];
        if (last?.value != null) {
          rawEngine     = last.value;
          rawEngineTime = last.time;
        }
      }
    }

    const patch = { samsaraId, lastSamsaraSync: now };
    // Only overwrite fields when we actually have fresh data
    if (faultRows.length > 0)  patch.faultCodes      = faultById[samsaraId] || [];
    if (rawFuel   != null)    { patch.fuelPercent    = rawFuel;   patch.fuelPercentTime = rawFuelTime; }
    if (rawEngine != null)    { patch.engineState    = rawEngine; patch.engineStateTime = rawEngineTime; }
    if (rawGps    != null)     patch.gpsData         = rawGps;
    if (rawOdom   != null)     patch.currentOdometer = Math.round(rawOdom * METERS_TO_MILES);

    report.matched = report.matched || [];
    report.matched.push({
      unit:   truck.unitNumber,
      samsaraId,
      odom:   rawOdom,
      fuel:   rawFuel,
      engine: rawEngine,
      gps:    rawGps,
    });

    try {
      await db.collection("trucks").doc(docSnap.id).update(patch);
      report.synced++;
    } catch (err) {
      report.errors.push(`Unit ${truck.unitNumber || docSnap.id}: ${err.message}`);
    }
  }

  return json(200, {
    success: true,
    report,
    debug: {
      odomRows:     odomRows.length,
      gpsOdomRows:  gpsOdomRows.length,
      faultRows:    faultRows.length,
      fuelRows:     fuelRows.length,
      gpsRows:      gpsRows.length,
      engineRows:   engineRows.length,
      vehicleRows:  vehicleRows.length,
      locationRows: locationRows.length,
      apiErrors,
    },
  });
};
