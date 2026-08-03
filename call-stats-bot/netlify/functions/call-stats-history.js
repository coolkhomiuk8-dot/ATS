// GET endpoint serving the stored snapshot history for the dashboard page.

import { getHistoryStore } from "./_blobs-store.js";

const KEY = "snapshots";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "GET only" };

  const store = getHistoryStore();
  const snapshots = (await store.get(KEY, { type: "json" })) || [];

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ snapshots }),
  };
};
