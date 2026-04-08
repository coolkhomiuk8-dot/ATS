// RingCentral helper — fetches Emma HR (ext. 106) call stats for today

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

async function getRCToken() {
  const creds = Buffer.from(
    `${process.env.RC_CLIENT_ID}:${process.env.RC_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://platform.ringcentral.com/restapi/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: process.env.RC_JWT_TOKEN,
    }).toString(),
  });

  if (!res.ok) throw new Error(`RC auth failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

export async function getEmmaCallStats() {
  if (!process.env.RC_CLIENT_ID || !process.env.RC_JWT_TOKEN) return null;

  try {
    const token = await getRCToken();

    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const offsetStr = getETOffsetStr();
    const dateFrom = encodeURIComponent(`${todayET}T00:00:00${offsetStr}`);

    const res = await fetch(
      `https://platform.ringcentral.com/restapi/v1.0/account/~/extension/106/call-log` +
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
  } catch (e) {
    console.error("RingCentral error:", e.message);
    return null; // не ламаємо дайджест якщо RC недоступний
  }
}
