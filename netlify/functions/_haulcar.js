// Shared helpers for Haulcar Pro TMS integration.
//
// API: https://haulcar.pro/api/integrations/netify
// Auth: Authorization: Bearer <HAULCAR_API_KEY>
//
// Response item fields:
//   date, status, rate, broker, dispatcher
//   puCity, puState, puDate, delCity, delState, delDate
//   loadedMiles, emptyMiles, rpm, unit
//
// No load id is returned, so we generate a stable synthetic id.

import crypto from "crypto";

const HAULCAR_BASE = "https://haulcar.pro/api/integrations/netify";

/**
 * Make a GET request to Haulcar with pagination params.
 * Returns the parsed JSON body or throws.
 */
async function haulcarGet(apiKey, { limit = 200, offset = 0 } = {}) {
  const url = `${HAULCAR_BASE}?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Haulcar ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch every load from Haulcar by following pagination until exhausted.
 * Caps at `maxItems` to prevent runaway pagination.
 */
async function fetchAllLoads(apiKey, { pageSize = 100, maxItems = 10000 } = {}) {
  let all = [];
  let offset = 0;
  let total = null;
  while (all.length < maxItems) {
    const page = await haulcarGet(apiKey, { limit: pageSize, offset });
    const items = Array.isArray(page?.items) ? page.items : [];
    if (typeof page?.total === "number") total = page.total;
    all = all.concat(items);
    // Stop only on a completely empty page (end of data)
    if (items.length === 0) break;
    // Stop if we've fetched everything according to total
    if (total != null && all.length >= total) break;
    offset += pageSize;
  }
  return { items: all.slice(0, maxItems), total };
}

/**
 * Generate a stable id for a load — deterministic, so the same load
 * always maps to the same Firestore doc id (deduplication on re-sync).
 */
function loadDocId(load) {
  const key = JSON.stringify({
    date:    load.date    || "",
    unit:    load.unit    || "",
    broker:  load.broker  || "",
    puDate:  load.puDate  || "",
    delDate: load.delDate || "",
    rate:    load.rate    ?? 0,
  });
  return "load_" + crypto.createHash("md5").update(key).digest("hex").slice(0, 20);
}

/**
 * Compute ISO week key in EST (e.g. "2026-W18") for a given date.
 * Week starts Monday 00:00 EST and ends Sunday 23:59 EST.
 * Used for fast filtering and grouping in the UI.
 */
function weekKeyEst(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;

  // Convert to EST/EDT
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const y = +parts.year, m = +parts.month, day = +parts.day;
  const wdMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const fromMon = wdMap[parts.weekday] ?? 0;

  // Roll back to Monday of that week
  let wY = y, wM = m, wD = day - fromMon;
  while (wD < 1) {
    wM -= 1;
    if (wM < 1) { wM = 12; wY -= 1; }
    wD += new Date(wY, wM, 0).getDate();
  }

  // ISO week number — count weeks from week1Mon (Monday of week 1)
  const jan4 = new Date(Date.UTC(wY, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // 0 = Mon
  const week1Mon = new Date(Date.UTC(wY, 0, 4 - jan4Day));
  const target = new Date(Date.UTC(wY, wM - 1, wD));
  const diffDays = Math.round((target - week1Mon) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  return `${wY}-W${String(week).padStart(2, "0")}`;
}

/**
 * Parse a Haulcar load object into the shape we store in Firestore.
 * Coerces numbers, validates dates, and adds derived fields.
 */
function normalizeLoad(raw) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  // Try every likely field name the TMS might use for a load reference number
  const loadNumber =
    raw.loadNumber || raw.load_number || raw.loadNo || raw.load_no ||
    raw.loadId || raw.load_id || raw.id ||
    raw.number || raw.ref || raw.referenceNumber || raw.reference ||
    raw.poNumber || raw.po || null;
  return {
    loadNumber:  loadNumber ? String(loadNumber) : null,
    date:        raw.date     || null,
    status:      raw.status   || null,
    rate:        num(raw.rate),
    broker:      raw.broker   || null,
    puCity:      raw.puCity   || null,
    puState:     raw.puState  || null,
    puDate:      raw.puDate   || null,
    delCity:     raw.delCity  || null,
    delState:    raw.delState || null,
    delDate:     raw.delDate  || null,
    loadedMiles: num(raw.loadedMiles),
    emptyMiles:  num(raw.emptyMiles),
    rpm:         num(raw.rpm),
    // Haulcar returns unit as "103 Joseph Okoro" — split into truck number + driver name
    unit:        (() => {
      const u = raw.unit ? String(raw.unit).trim() : "";
      return u.match(/^(\d+)/)?.[1] || u || null;
    })(),
    driverName:  (() => {
      // Prefer explicit API fields if present, else parse from unit string
      if (raw.driverName) return String(raw.driverName).trim();
      if (raw.driver)     return String(raw.driver).trim();
      const u = raw.unit ? String(raw.unit).trim() : "";
      const rest = u.replace(/^\d+\s*/, "").trim();
      return rest || null;
    })(),
    dispatcher:  raw.dispatcher || null,
    weekKey:     weekKeyEst(raw.puDate || raw.date),
  };
}

/**
 * Sync the loads array into Firestore.
 * Uses a content hash to skip writes for unchanged loads (saves Firestore quota).
 *
 * Returns: { written, skipped, errors }
 */
async function syncLoadsToFirestore(db, loads, { now = new Date().toISOString() } = {}) {
  const report = { written: 0, skipped: 0, errors: [] };

  // Read existing in batches (Firestore has a 10-key `in` limit, so we
  // just read the whole collection once — cheaper than N targeted reads).
  let existingMap = new Map();
  try {
    const snap = await db.collection("loads").get();
    snap.forEach((doc) => existingMap.set(doc.id, doc.data()));
  } catch (e) {
    report.errors.push(`Read loads collection: ${e.message}`);
  }

  // Write in chunks of 400 (Firestore batch limit is 500, leave headroom).
  const chunks = [];
  let batch = db.batch();
  let count = 0;
  for (const raw of loads) {
    const id = loadDocId(raw);

    const normalized = normalizeLoad(raw);
    const contentHash = crypto.createHash("md5").update(JSON.stringify(normalized)).digest("hex");
    const existing = existingMap.get(id);

    if (existing && existing.contentHash === contentHash) {
      report.skipped++;
      continue;
    }

    batch.set(
      db.collection("loads").doc(id),
      { ...normalized, contentHash, lastSyncedAt: now },
      { merge: true }
    );
    count++;
    report.written++;

    if (count >= 400) {
      chunks.push(batch);
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) chunks.push(batch);

  for (const b of chunks) {
    try { await b.commit(); }
    catch (e) { report.errors.push(`Batch commit: ${e.message}`); }
  }

  return report;
}

export {
  haulcarGet,
  fetchAllLoads,
  loadDocId,
  weekKeyEst,
  normalizeLoad,
  syncLoadsToFirestore,
};
