// Scheduled every 30 minutes — stores a snapshot of current per-person call
// stats to Netlify Blobs, so the dashboard (dashboard.html + call-stats-history.js)
// can show trends over the past month instead of only "right now".

import { getHistoryStore } from "./_blobs-store.js";
import { getAllTrackedCallStats } from "./_ringcentral.js";
import Anthropic from "@anthropic-ai/sdk";

const KEY = "snapshots";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000; // keep a month, per the dashboard's scope

async function getTrendNote(stats, previous) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const ok = stats.filter((s) => !s.error);
  if (ok.length === 0) return null;

  const prevByName = new Map((previous?.stats || []).map((s) => [s.name, s]));
  const lines = ok.map((s) => {
    const prev = prevByName.get(s.name);
    const delta = prev ? s.callCount - prev.callCount : null;
    return `${s.name} (${s.account}): ${s.callCount} дзвінків${delta !== null ? ` (${delta >= 0 ? "+" : ""}${delta} за 30хв)` : ""}`;
  }).join("\n");

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content:
            `Ти — асистент диспетчерської компанії. Ось поточна статистика дзвінків команди, з динамікою за останні 30 хв.\n` +
            `Ціль — 50 дзвінків/день на людину, менше 30 — реальна проблема, незважаючи на те, як йдуть справи в інших.\n` +
            `Дай ОДНЕ-ДВА коротких речення українською: що варто скоригувати прямо зараз (хто відстає від цілі, хто застряг на нулі, хто різко сповільнився).\n` +
            `Якщо все в нормі — так і скажи одним словом. Без markdown, звичайний текст.\n\n${lines}`,
        },
      ],
    });
    return res.content.find((b) => b.type === "text")?.text?.trim() || null;
  } catch (e) {
    console.error("Trend note error:", e.message);
    return null;
  }
}

export const handler = async () => {
  const stats = await getAllTrackedCallStats();
  const now = Date.now();

  const store = getHistoryStore();
  const existing = (await store.get(KEY, { type: "json" })) || [];
  const previous = existing[existing.length - 1] || null;

  const note = await getTrendNote(stats, previous);

  const entry = {
    ts: now,
    stats: stats
      .filter((s) => !s.error)
      .map((s) => ({ account: s.account, name: s.name, callCount: s.callCount, recentCount: s.recentCount })),
    errors: stats.filter((s) => s.error).map((s) => ({ account: s.account, error: s.error })),
    note,
  };

  const pruned = existing.filter((e) => now - e.ts < MAX_AGE_MS);
  pruned.push(entry);

  await store.setJSON(KEY, pruned);

  return { statusCode: 200, body: `Snapshot stored. ${pruned.length} total.` };
};
