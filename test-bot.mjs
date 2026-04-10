// Local test script — run with: node test-bot.mjs
// Tests Telegram connectivity and Firestore dispatcher read

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually
const envPath = resolve(".//.env");
const envLines = readFileSync(envPath, "utf-8").split("\n");
for (const line of envLines) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── 1. Test Telegram ─────────────────────────────────────────────────────────
console.log("1. Sending test Telegram message...");
const tgRes = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: CHAT_ID,
    text: "✅ <b>Бот підключено!</b>\n\nATS Dispatcher Bot працює. Нагадування та дайджести будуть надходити сюди.",
    parse_mode: "HTML",
  }),
});
const tgData = await tgRes.json();
if (tgData.ok) {
  console.log("   ✓ Telegram OK — повідомлення надіслано");
} else {
  console.error("   ✗ Telegram error:", tgData);
  process.exit(1);
}

// ── 2. Test Firestore ────────────────────────────────────────────────────────
const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
if (!saJson) {
  console.log("2. Firestore: FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping");
  console.log("\nDone. Add FIREBASE_SERVICE_ACCOUNT_JSON to .env to test full flow.");
  process.exit(0);
}

console.log("2. Reading dispatchers from Firestore...");
const { default: admin } = await import("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saJson)) });
const db = admin.firestore();
const snap = await db.collection("dispatchers").get();
const dispatchers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`   ✓ Found ${dispatchers.length} dispatchers`);

// Show who has nextAction set
const withAction = dispatchers.filter((d) => d.nextActionDate);
if (withAction.length) {
  console.log(`   → ${withAction.length} з nextActionDate:`);
  for (const d of withAction) {
    console.log(`     • ${d.name} — ${d.nextActionDate} ${d.nextActionTime || ""}`);
  }
} else {
  console.log("   → Жоден диспетчер не має nextActionDate (задай у drawer для тесту)");
}

// Show stale
const now = new Date();
const stale = dispatchers.filter((d) => {
  const active = new Set(["new_lead", "no_answer_1", "no_answer_2", "tg_sent", "in_comms", "interview"]);
  if (!active.has(d.stage)) return false;
  const last = d.stageChangedAt ? new Date(d.stageChangedAt) : new Date(d.createdAt || 0);
  return (now - last) / (1000 * 60 * 60 * 24) >= 2;
});
console.log(`   → ${stale.length} завислих (2+ дні без змін)`);

console.log("\nDone. All checks passed!");
process.exit(0);
