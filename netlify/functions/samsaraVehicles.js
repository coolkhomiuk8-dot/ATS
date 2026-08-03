/**
 * Returns the list of vehicles from Samsara so the frontend can
 * display them and let the admin manually link each one to a truck.
 */
import { requireAdminOrRoot } from "./_auth.js";

const SAMSARA_BASE = "https://api.samsara.com";

function json(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "GET only" });

  try {
    await requireAdminOrRoot(event.headers.authorization || event.headers.Authorization);
  } catch (err) {
    return json(err.statusCode || 401, { error: err.message });
  }

  const apiKey = process.env.SAMSARA_API_KEY;
  if (!apiKey) return json(500, { error: "SAMSARA_API_KEY env var not set." });

  let vehicles = [];
  let cursor = null;

  do {
    const qs = `limit=512${cursor ? `&after=${cursor}` : ""}`;
    const res = await fetch(`${SAMSARA_BASE}/fleet/vehicles?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return json(res.status, { error: `Samsara ${res.status}: ${text}` });
    }
    const page = await res.json();
    vehicles = vehicles.concat(
      (page.data || []).map((v) => ({
        id: v.id,
        name: v.name || "",
        vin: v.externalIds?.["samsara.vin"] || v.vin || "",
        serial: v.serial || "",
      }))
    );
    cursor = page.pagination?.hasNextPage ? page.pagination.endCursor : null;
  } while (cursor);

  return json(200, { vehicles });
};
