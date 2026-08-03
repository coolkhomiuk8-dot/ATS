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

// One request (paginated) for the whole account's calls today, grouped by
// the internal extension id that owns each record.
async function fetchAccountCallLogToday(clientId, clientSecret, jwt) {
  const token = await getRCToken(clientId, clientSecret, jwt);

  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const offsetStr = getETOffsetStr();
  const dateFrom = encodeURIComponent(`${todayET}T00:00:00${offsetStr}`);

  const perExtension = new Map(); // internal id -> { callCount, totalSec }
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
      const cur = perExtension.get(key) || { callCount: 0, totalSec: 0 };
      cur.callCount += 1;
      cur.totalSec += rec.duration || 0;
      perExtension.set(key, cur);
    }

    if (!data.navigation?.nextPage) break;
    page++;
  }

  return perExtension;
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
const ACCOUNT1_EXTENSIONS = parseExtensionList(
  "1214947035:Amara HR Manager,485068034:Anastasiia General,1181387035:Antony Fleet," +
    "865715035:David David,483529034:Diana Gomez,1148405035:Emma HR,1168919035:Henry Anderson," +
    "1214973035:Jim Davis,485644034:Johnny Morgan,1226045035:Kateryna Fleet Management," +
    "1041243035:Kent White,484845034:Maxym Dispatcher,484771034:Nick Dispatch," +
    "484808034:Tony Dispatcher,484768034:Tyler Mans"
);

// TODO: these are still the short "Ext." numbers from the admin UI, not resolved
// internal ids — account 2's RC app is also missing the "Read Call Log"
// permission entirely (confirmed 2026-08-03: API returned
// InsufficientPermissions/ReadCallLog for the company call-log endpoint).
// Once that permission is added in RC2's Developer Console app, re-resolve each
// person's internal id the same way account 1's were resolved (pull ~30 days of
// company call-log and read `extension.id` off a record from each person).
const ACCOUNT2_EXTENSIONS = parseExtensionList(
  "5570:Alex Dispatcher,5568:Andrew Kondes,5571:Blake Skylar,5575:Bob Perez," +
    "5569:Dennis Milton,120:Jeff Watson,102:Kelsey Jones,103:Matt White," +
    "5574:Michael Hayes,5572:Rick Cash,5576:Ross Lopez,5573:Roy Torres,5566:UT Service"
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

    for (const ext of acc.extensions) {
      const stat = perExtension.get(String(ext.id));
      const callCount = stat?.callCount || 0;
      const totalSec = stat?.totalSec || 0;
      results.push({
        account: acc.label,
        id: ext.id,
        name: ext.name,
        callCount,
        timeStr: formatDuration(totalSec),
        avgStr: formatAvg(callCount, totalSec),
      });
    }
  }

  return results;
}
