// RingCentral helper — call stats across one or more RC accounts / extensions.
//
// Account 1 (existing, e.g. Emma HR):
//   RC_CLIENT_ID, RC_CLIENT_SECRET, RC_JWT_TOKEN   — JWT app credentials
//
// Account 2 (second RC account, other half of the team):
//   RC_CLIENT_ID_2, RC_CLIENT_SECRET_2, RC_JWT_TOKEN_2
//
// IMPORTANT: the roster below is keyed by RingCentral's INTERNAL extension id
// (e.g. "1148405035"), NOT the short extension number shown in the admin UI's
// "Ext." column (e.g. "106") — the two are different RC identifiers, and the
// API rejects the short number. Resolve the internal id for someone new by
// finding a call they made in the company call-log and reading `extension.id`
// off that record (see getAllTrackedCallStats below, which does this in bulk).
//
// Fetching also uses the single company-wide call-log endpoint
// (`/account/~/call-log`) instead of one request per extension: querying
// per-extension needs an admin "Company Call Log" grant AND trips RC's rate
// limit fast with more than a couple of people; the company-wide endpoint is
// one request per account and only needs plain "Read Call Log".

function getETOffsetStr() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(new Date());
  const tz = parts.find((p) => p.type === "timeZoneName")?.value || "GMT-4";
  const match = tz.match(/GMT([+-])(\d+)/);
  if (!match) return "-04:00";
  const [, sign, hours] = match;
  return `${sign}${hours.padStart(2, "0")}:00`;
}

async function getRCToken(clientId, clientSecret, jwt) {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://platform.ringcentral.com/restapi/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });

  if (!res.ok) throw new Error(`RC auth failed (${res.status})`);
  return (await res.json()).access_token;
}

function formatDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return h > 0 ? `${h}г ${m}хв` : `${m}хв`;
}

function formatAvg(callCount, totalSec) {
  const avgSec = callCount > 0 ? Math.round(totalSec / callCount) : 0;
  const avgM = Math.floor(avgSec / 60);
  const avgS = avgSec % 60;
  return avgM > 0 ? `${avgM}хв ${avgS}с` : `${avgS}с`;
}

const RECENT_WINDOW_MS = 2 * 60 * 60 * 1000; // "recent" = last 2 hours

// One request (paginated) for the whole account's calls today, grouped by
// the internal extension id that owns each record. Also tallies a "recent"
// (last 2h) count per extension from the same records — no extra RC call.
async function fetchAccountCallLogToday(clientId, clientSecret, jwt) {
  const token = await getRCToken(clientId, clientSecret, jwt);

  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const offsetStr = getETOffsetStr();
  const dateFrom = encodeURIComponent(`${todayET}T00:00:00${offsetStr}`);
  const recentCutoff = Date.now() - RECENT_WINDOW_MS;

  const perExtension = new Map(); // internal id -> { callCount, totalSec, recentCount }
  let page = 1;

  for (let i = 0; i < 20; i++) {
    const res = await fetch(
      `https://platform.ringcentral.com/restapi/v1.0/account/~/call-log` +
        `?dateFrom=${dateFrom}&type=Voice&view=Simple&perPage=250&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`RC call log failed (${res.status})`);
    const data = await res.json();

    for (const rec of data.records || []) {
      const extId = rec.extension?.id;
      if (!extId) continue;
      const key = String(extId);
      const cur = perExtension.get(key) || { callCount: 0, totalSec: 0, recentCount: 0 };
      cur.callCount += 1;
      cur.totalSec += rec.duration || 0;
      if (rec.startTime && new Date(rec.startTime).getTime() >= recentCutoff) cur.recentCount += 1;
      perExtension.set(key, cur);
    }

    if (!data.navigation?.nextPage) break;
    page++;
  }

  return perExtension;
}

// One request (paginated) spanning yesterday 00:00 ET through now, bucketed
// into "today" vs "yesterday" per extension — used for free-text Q&A, where
// the question might be about either day.
async function fetchAccountCallLogTodayAndYesterday(clientId, clientSecret, jwt) {
  const token = await getRCToken(clientId, clientSecret, jwt);

  const offsetStr = getETOffsetStr();
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const yesterdayET = new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const dateFrom = encodeURIComponent(`${yesterdayET}T00:00:00${offsetStr}`);

  const todayMap = new Map();
  const yesterdayMap = new Map();
  let page = 1;

  for (let i = 0; i < 30; i++) {
    const res = await fetch(
      `https://platform.ringcentral.com/restapi/v1.0/account/~/call-log` +
        `?dateFrom=${dateFrom}&type=Voice&view=Simple&perPage=250&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`RC call log failed (${res.status})`);
    const data = await res.json();

    for (const rec of data.records || []) {
      const extId = rec.extension?.id;
      if (!extId || !rec.startTime) continue;
      const recDateET = new Date(rec.startTime).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const map = recDateET === todayET ? todayMap : recDateET === yesterdayET ? yesterdayMap : null;
      if (!map) continue;

      const key = String(extId);
      const cur = map.get(key) || { callCount: 0, totalSec: 0 };
      cur.callCount += 1;
      cur.totalSec += rec.duration || 0;
      map.set(key, cur);
    }

    if (!data.navigation?.nextPage) break;
    page++;
  }

  return { todayMap, yesterdayMap };
}

function parseExtensionList(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [id, ...nameParts] = pair.split(":");
      return { id: id.trim(), name: nameParts.join(":").trim() || id.trim() };
    });
}

// Kept for backward compatibility — used by _driver-analytics.js (evening HR digest).
export async function getEmmaCallStats() {
  if (!process.env.RC_CLIENT_ID || !process.env.RC_JWT_TOKEN) return null;

  try {
    const token = await getRCToken(
      process.env.RC_CLIENT_ID,
      process.env.RC_CLIENT_SECRET,
      process.env.RC_JWT_TOKEN
    );
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const offsetStr = getETOffsetStr();
    const dateFrom = encodeURIComponent(`${todayET}T00:00:00${offsetStr}`);

    // "~" resolves to the JWT user's own extension (Emma, 106) — no admin scope needed.
    const res = await fetch(
      `https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/call-log` +
        `?dateFrom=${dateFrom}&type=Voice&view=Simple&perPage=250`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`RC call log failed: ${await res.text()}`);
    const { records = [] } = await res.json();

    const callCount = records.length;
    const totalSec = records.reduce((s, r) => s + (r.duration || 0), 0);
    return { callCount, timeStr: formatDuration(totalSec), avgStr: formatAvg(callCount, totalSec) };
  } catch (e) {
    console.error("RingCentral error:", e.message);
    return { error: e.message };
  }
}

// Roster (internal extension id -> name) lives in code, not env vars: it's not
// a secret, and Netlify bakes every env var into every function's Lambda
// bundle, which is capped at 4KB total (AWS Lambda limit) — a long roster
// string blows that budget. To update who's tracked, just edit these lists.
// Antony Fleet, Emma HR, Kateryna Fleet Management, Kent White, Kelsey Jones,
// Michael Hayes, and UT Service removed 2026-08-04 per request — not
// dispatchers, not needed for this tracking. Amara HR Manager removed
// 2026-08-05 — also an HR role, not a dispatcher.
const ACCOUNT1_EXTENSIONS = parseExtensionList(
  "485068034:Anastasiia General," +
    "865715035:David David,483529034:Diana Gomez,1168919035:Henry Anderson," +
    "1214973035:Jim Davis,485644034:Johnny Morgan," +
    "484845034:Maxym Dispatcher,484771034:Nick Dispatch," +
    "484808034:Tony Dispatcher,484768034:Tyler Mans"
);

// Resolved 2026-08-03 from 30 days of company call-log after "Read Call Log"
// was added to account 2's app. Roy Torres made no calls in that window, so
// his internal id couldn't be resolved this way — add him once he's made at
// least one call, or get his id from an admin export.
const ACCOUNT2_EXTENSIONS = parseExtensionList(
  "2198706019:Alex Dispatcher,2186731019:Andrew Kondes,2200528019:Blake Skylar," +
    "882868018:Bob Perez,2186732019:Dennis Milton,2186520019:Jeff Watson," +
    "2153100019:Mason Collins,2061583019:Matt White," +
    "2201973019:Rick Cash,2203136019:Ross Lopez"
);

function accountConfigs() {
  return [
    {
      label: "Акаунт 1",
      clientId: process.env.RC_CLIENT_ID,
      clientSecret: process.env.RC_CLIENT_SECRET,
      jwt: process.env.RC_JWT_TOKEN,
      extensions: ACCOUNT1_EXTENSIONS,
    },
    {
      label: "Акаунт 2",
      clientId: process.env.RC_CLIENT_ID_2,
      clientSecret: process.env.RC_CLIENT_SECRET_2,
      jwt: process.env.RC_JWT_TOKEN_2,
      extensions: ACCOUNT2_EXTENSIONS,
    },
  ];
}

// Fetches call stats for every configured extension across both RC accounts.
// Returns a flat array: [{ account, id, name, callCount, timeStr, avgStr, error? }, ...]
export async function getAllTrackedCallStats() {
  const results = [];

  for (const acc of accountConfigs()) {
    if (!acc.clientId || !acc.jwt || acc.extensions.length === 0) continue;

    let perExtension;
    try {
      perExtension = await fetchAccountCallLogToday(acc.clientId, acc.clientSecret, acc.jwt);
    } catch (e) {
      console.error(`RingCentral error (${acc.label}):`, e.message);
      // One shared error line per account instead of repeating it per extension —
      // keeps the Telegram message short enough to actually send.
      results.push({ account: acc.label, id: null, name: `(${acc.label})`, error: e.message.slice(0, 200) });
      continue;
    }

    const extResults = acc.extensions.map((ext) => {
      const stat = perExtension.get(String(ext.id));
      const callCount = stat?.callCount || 0;
      const totalSec = stat?.totalSec || 0;
      return {
        account: acc.label,
        id: ext.id,
        name: ext.name,
        callCount,
        recentCount: stat?.recentCount || 0,
        timeStr: formatDuration(totalSec),
        avgStr: formatAvg(callCount, totalSec),
      };
    });

    // Busiest first — makes leaders and zero-activity people equally obvious at a glance.
    extResults.sort((a, b) => b.callCount - a.callCount);
    results.push(...extResults);
  }

  return results;
}

// For free-text Q&A (answerCallStatsQuestion in _call-stats.js) — same
// roster, but with both today's and yesterday's counts per person.
export async function getTodayAndYesterdayStats() {
  const today = [];
  const yesterday = [];

  for (const acc of accountConfigs()) {
    if (!acc.clientId || !acc.jwt || acc.extensions.length === 0) continue;

    let todayMap, yesterdayMap;
    try {
      ({ todayMap, yesterdayMap } = await fetchAccountCallLogTodayAndYesterday(
        acc.clientId,
        acc.clientSecret,
        acc.jwt
      ));
    } catch (e) {
      console.error(`RingCentral error (${acc.label}):`, e.message);
      const errRow = { account: acc.label, name: `(${acc.label})`, error: e.message.slice(0, 200) };
      today.push(errRow);
      yesterday.push(errRow);
      continue;
    }

    for (const ext of acc.extensions) {
      const t = todayMap.get(String(ext.id));
      const y = yesterdayMap.get(String(ext.id));
      today.push({
        account: acc.label,
        name: ext.name,
        callCount: t?.callCount || 0,
        timeStr: formatDuration(t?.totalSec || 0),
      });
      yesterday.push({
        account: acc.label,
        name: ext.name,
        callCount: y?.callCount || 0,
        timeStr: formatDuration(y?.totalSec || 0),
      });
    }
  }

  return { today, yesterday };
}
