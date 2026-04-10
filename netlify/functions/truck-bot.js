// Telegram webhook — truck status management for HR group chat
// Commands:
//   /trucks              — show all trucks and status
//   /free 102 103 142    — mark trucks as free (need driver)
//   /covered 102 103     — mark trucks as covered (driver assigned)
//   /vin 102 1HGBH...    — set VIN for a truck
//   /addtruck 145        — add new truck
//   /removetruck 145     — remove truck

import { getDb } from "./_auth.js";
import { FieldValue } from "firebase-admin/firestore";

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const HR_CHAT_ID = process.env.TELEGRAM_HR_CHAT_ID;

async function reply(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

function parseUnits(str) {
  return str.match(/\b1\d{2}\b/g) || []; // 3-digit numbers starting with 1 (101–199)
}

async function cmdTrucks(db, chatId) {
  const snap = await db.collection("trucks").orderBy("unit", "asc").get();
  if (snap.empty) {
    return reply(chatId, "Траків ще немає. Додай: <code>/addtruck 101</code>");
  }

  const free    = [];
  const covered = [];
  snap.forEach((doc) => {
    const { unit, vin, status } = doc.data();
    const label = vin ? `${unit} <i>(${vin.slice(-6)})</i>` : `${unit}`;
    if (status === "covered") covered.push(label);
    else free.push(label);
  });

  let msg = `🚛 <b>Траки (${snap.size} всього)</b>\n\n`;
  msg += `✅ <b>Покриті (${covered.length}):</b>\n`;
  msg += covered.length ? covered.map(u => `  • ${u}`).join("\n") : "  —";
  msg += `\n\n🔴 <b>Вільні — потрібен водій (${free.length}):</b>\n`;
  msg += free.length ? free.map(u => `  • ${u}`).join("\n") : "  —";

  return reply(chatId, msg);
}

async function cmdSetStatus(db, chatId, units, status, from) {
  if (!units.length) return reply(chatId, "Вкажи номери траків. Приклад: <code>/free 102 103</code>");

  const batch = db.batch();
  for (const unit of units) {
    const ref = db.collection("trucks").doc(unit);
    batch.set(ref, { unit, status, updatedAt: FieldValue.serverTimestamp(), updatedBy: from }, { merge: true });
  }
  await batch.commit();

  const label = status === "covered" ? "✅ Покриті (водій є)" : "🔴 Вільні (потрібен водій)";
  return reply(chatId, `${label}: <b>${units.join(", ")}</b>`);
}

async function cmdVin(db, chatId, args) {
  const parts = args.trim().split(/\s+/);
  const unit = parts[0];
  const vin  = parts[1];
  if (!unit || !vin) return reply(chatId, "Приклад: <code>/vin 102 1HGBH41JXMN109186</code>");

  await db.collection("trucks").doc(unit).set(
    { unit, vin: vin.toUpperCase(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return reply(chatId, `VIN для <b>${unit}</b> збережено: <code>${vin.toUpperCase()}</code>`);
}

async function cmdAdd(db, chatId, args, from) {
  const parts = args.trim().split(/\s+/);
  const unit  = parts[0];
  const vin   = parts[1] || null;
  if (!unit || !/^\d{3}$/.test(unit)) return reply(chatId, "Вкажи номер юніту. Приклад: <code>/addtruck 145</code>");

  const ref  = db.collection("trucks").doc(unit);
  const snap = await ref.get();
  if (snap.exists) return reply(chatId, `Трак <b>${unit}</b> вже існує.`);

  await ref.set({ unit, vin: vin ? vin.toUpperCase() : null, status: "free", updatedAt: FieldValue.serverTimestamp(), updatedBy: from });
  return reply(chatId, `Трак <b>${unit}</b> додано${vin ? ` (VIN: <code>${vin.toUpperCase()}</code>)` : ""}. Статус: 🔴 Вільний`);
}

async function cmdRemove(db, chatId, args) {
  const unit = args.trim();
  if (!unit) return reply(chatId, "Вкажи номер юніту. Приклад: <code>/removetruck 145</code>");

  await db.collection("trucks").doc(unit).delete();
  return reply(chatId, `Трак <b>${unit}</b> видалено.`);
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "ok" };

  let update;
  try { update = JSON.parse(event.body); } catch { return { statusCode: 200, body: "ok" }; }

  const msg = update.message || update.edited_message;
  if (!msg?.text) return { statusCode: 200, body: "ok" };

  const chatId = String(msg.chat.id);
  const text   = msg.text.trim();
  const from   = msg.from?.username || msg.from?.first_name || "HR";

  // Only handle messages from the HR chat or owner's personal chat
  const OWNER_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "384588590";
  const allowedChats = [String(HR_CHAT_ID), String(OWNER_CHAT_ID)];
  if (!allowedChats.includes(chatId)) return { statusCode: 200, body: "ok" };

  const db = getDb();

  try {
    if (/^\/trucks(@\S+)?$/i.test(text)) {
      await cmdTrucks(db, chatId);

    } else if (/^\/free(@\S+)?(\s|$)/i.test(text)) {
      const args  = text.replace(/^\/free(@\S+)?\s*/i, "");
      const units = parseUnits(args);
      await cmdSetStatus(db, chatId, units, "free", from);

    } else if (/^\/covered(@\S+)?(\s|$)/i.test(text)) {
      const args  = text.replace(/^\/covered(@\S+)?\s*/i, "");
      const units = parseUnits(args);
      await cmdSetStatus(db, chatId, units, "covered", from);

    } else if (/^\/vin(@\S+)?\s/i.test(text)) {
      const args = text.replace(/^\/vin(@\S+)?\s*/i, "");
      await cmdVin(db, chatId, args);

    } else if (/^\/addtruck(@\S+)?\s/i.test(text)) {
      const args = text.replace(/^\/addtruck(@\S+)?\s*/i, "");
      await cmdAdd(db, chatId, args, from);

    } else if (/^\/removetruck(@\S+)?\s/i.test(text)) {
      const args = text.replace(/^\/removetruck(@\S+)?\s*/i, "");
      await cmdRemove(db, chatId, args);
    }
  } catch (e) {
    console.error("truck-bot error:", e.message);
    await reply(chatId, `❌ Помилка: ${e.message}`);
  }

  return { statusCode: 200, body: "ok" };
};
