// RingCentral helper — call stats across one or more RC accounts / extensions.
//
// Account 1 (existing, e.g. Emma HR):
//   RC_CLIENT_ID, RC_CLIENT_SECRET, RC_JWT_TOKEN   — JWT app credentials
//   RC_ACCOUNT1_EXTENSIONS = "106:Emma"             — "id:Name" pairs, comma-separated
//     (if RC_ACCOUNT1_EXTENSIONS is unset, defaults to "106:Emma" for backward compat)
//
// Account 2 (second RC account, other half of the team):
//   RC_CLIENT_ID_2, RC_CLIENT_SECRET_2, RC_JWT_TOKEN_2
//   RC_ACCOUNT2_EXTENSIONS = "201:Maria,202:Ivan"
//
// NOTE: tracking an extension other than the JWT user's own ("~") requires the
// JWT user to be an account admin and the RC app to have Call Log read access
// at the account/company level, not just the personal scope.

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

  if (!res.ok) throw new Error(`RC auth failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function fetchExtensionCallStats(token, extensionId) {
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const offsetStr = getETOffsetStr();
  const dateFrom = encodeURIComponent(`${todayET}T00:00:00${offsetStr}`);

  const res = await fetch(
    `https://platform.ringcentral.com/restapi/v1.0/account/~/extension/${extensionId}/call-log` +
      `?dateFrom=${dateFrom}&type=Voice&view=Simple&perPage=250`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`RC call log failed: ${await res.text()}`);
  const { records = [] } = await res.json();

  const callCount = records.length;
  const totalSec = records.reduce((s, r) => s + (r.duration || 0), 0);

  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const timeStr = h > 0 ? `${h}г ${m}хв` : `${m}хв`;

  const avgSec = callCount > 0 ? Math.round(totalSec / callCount) : 0;
  const avgM = Math.floor(avgSec / 60);
  const avgS = avgSec % 60;
  const avgStr = avgM > 0 ? `${avgM}хв ${avgS}с` : `${avgS}с`;

  return { callCount, timeStr, avgStr };
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
    // "~" resolves to the JWT user's own extension (Emma, 106) — no admin scope needed.
    return await fetchExtensionCallStats(token, "~");
  } catch (e) {
    console.error("RingCentral error:", e.message);
    return { error: e.message };
  }
}

// Roster (extension id -> name) lives in code, not env vars: it's not a secret,
// and Netlify bakes every env var into every function's Lambda bundle, which is
// capped at 4KB total (AWS Lambda limit) — a long roster string blows that budget.
// To update who's tracked, just edit these two lists.
const ACCOUNT1_EXTENSIONS = parseExtensionList(
  "110:Amara HR Manager,119:Anastasiia General,109:Antony Fleet,101:David David," +
    "113:Diana Gomez,106:Emma HR,107:Henry Anderson,111:Jim Davis,120:Johnny Morgan," +
    "114:Kateryna Fleet Management,105:Kent White,118:Maxym Dispatcher,116:Nick Dispatch," +
    "117:Tony Dispatcher,115:Tyler Mans"
);

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

    let token;
    try {
      token = await getRCToken(acc.clientId, acc.clientSecret, acc.jwt);
    } catch (e) {
      console.error(`RingCentral auth error (${acc.label}):`, e.message);
      for (const ext of acc.extensions) {
        results.push({ account: acc.label, id: ext.id, name: ext.name, error: `Auth: ${e.message}` });
      }
      continue;
    }

    for (const ext of acc.extensions) {
      try {
        const stats = await fetchExtensionCallStats(token, ext.id);
        results.push({ account: acc.label, id: ext.id, name: ext.name, ...stats });
      } catch (e) {
        console.error(`RingCentral call log error (${acc.label}, ext ${ext.id}):`, e.message);
        results.push({ account: acc.label, id: ext.id, name: ext.name, error: e.message });
      }
    }
  }

  return results;
}
