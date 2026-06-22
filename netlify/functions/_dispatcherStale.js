// Build a Telegram digest of dispatchers that have stalled in their current
// stage past the threshold. Shared by the scheduled morning digest and any
// manual on-demand trigger.

import { getDb } from "./_auth.js";

// Keep in sync with src/constants/dispatcherData.js → STAGE_STALE_DAYS.
const STAGE_STALE_DAYS = {
  new_lead:    1,
  no_answer_1: 1,
  no_answer_2: 2,
  tg_sent:     3,
  in_comms:    5,
  interview:   2,
  on_hold:     14,
};

// Labels for the digest message (Ukrainian — same as the kanban headers).
const STAGE_LABELS = {
  new_lead:    "🟦 New Lead",
  no_answer_1: "🟠 Не додзвонився 1 раз",
  no_answer_2: "🟧 Не додзвонився 2 раз",
  tg_sent:     "📨 Написав в Telegram",
  in_comms:    "💬 Веду комунікацію",
  interview:   "🟣 Interview Scheduled",
  on_hold:     "❄️ На паузі",
};

const DAY_MS = 86400000;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function daysSince(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS));
}

/**
 * Fetch all dispatchers and bucket the stale ones by stage.
 * Returns { byStage: { stageId: [{ name, age, telegram, phone, ... }] }, total }.
 */
export async function buildStaleBuckets(db) {
  const snap = await db.collection("dispatchers").get();
  const byStage = {};
  let total = 0;

  snap.forEach((doc) => {
    const d = doc.data();
    const threshold = STAGE_STALE_DAYS[d.stage];
    if (threshold == null) return; // terminal stage (hired / rejected) — skip

    const age = daysSince(d.stageChangedAt || d.createdAt);
    if (age == null || age <= threshold) return;

    if (!byStage[d.stage]) byStage[d.stage] = [];
    byStage[d.stage].push({
      id: doc.id,
      name: d.name || "(no name)",
      telegram: d.telegram || "",
      phone: d.phone || "",
      role: d.role || "",
      age,
      threshold,
    });
    total++;
  });

  // Sort each bucket: oldest first (most overdue)
  for (const list of Object.values(byStage)) list.sort((a, b) => b.age - a.age);

  return { byStage, total };
}

/** Build the HTML message body. Returns null when nothing is stale. */
export function formatDigest({ byStage, total }) {
  if (total === 0) return null;

  const lines = [
    `⚠ <b>Stale кандидати</b>`,
    `<i>Кандидати, які затрималися в стейджі довше за норму</i>`,
    "",
  ];

  // Stage order — match the kanban left-to-right reading order.
  const stageOrder = ["new_lead", "no_answer_1", "no_answer_2", "tg_sent", "in_comms", "interview", "on_hold"];
  for (const stage of stageOrder) {
    const list = byStage[stage];
    if (!list || list.length === 0) continue;
    lines.push(`<b>${STAGE_LABELS[stage] || stage}</b> · ${list.length}`);
    for (const c of list.slice(0, 15)) { // cap per-stage list to keep msg short
      const bits = [`<b>${escapeHtml(c.name)}</b>`, `(${c.age}d)`];
      const tgClean = c.telegram.replace(/^@/, "");
      if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(tgClean)) {
        bits.push(`<a href="https://t.me/${tgClean}">@${escapeHtml(tgClean)}</a>`);
      } else if (c.telegram) {
        bits.push(escapeHtml(c.telegram));
      } else if (c.phone) {
        bits.push(escapeHtml(c.phone));
      }
      lines.push("  • " + bits.join(" "));
    }
    if (list.length > 15) lines.push(`  <i>… і ще ${list.length - 15}</i>`);
    lines.push("");
  }

  lines.push(`<i>Всього: ${total}</i>`);
  return lines.join("\n");
}

export async function sendDigest(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_LEADS_CHAT_ID || process.env.TELEGRAM_HR_CHAT_ID;
  if (!token || !chatId) return { skipped: "missing token or chat id" };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  return { ok: res.ok, status: res.status };
}

export async function buildAndSend(db) {
  const buckets = await buildStaleBuckets(db);
  const text = formatDigest(buckets);
  if (!text) return { sent: false, reason: "no stale candidates" };
  const send = await sendDigest(text);
  return { sent: send.ok === true, total: buckets.total, ...send };
}

export { STAGE_STALE_DAYS, STAGE_LABELS };
