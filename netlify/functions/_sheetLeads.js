// Helpers for syncing dispatcher leads from a Google Sheet into Firestore.
//
// Sheet: shared Meta/Facebook Lead Ads export
// Columns: id, created_time, ad_*, adset_*, campaign_*, form_*, is_organic, platform,
//          (Ukrainian Q&A columns), full_name, phone, lead_status

import { google } from "googleapis";

const LEADS_SHEET_ID = process.env.LEADS_SHEET_ID || "1y44-r3rSVTNAvOSzZru7F7Dbh0Ua7K5AS_aSU2VJ1J4";

function getServiceAccount() {
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  if (projectId && privateKey && clientEmail) {
    return {
      type: "service_account",
      project_id:  projectId,
      private_key: privateKey.replace(/\\n/g, "\n"),
      client_email: clientEmail,
    };
  }
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) return JSON.parse(raw);
  throw new Error("Missing service account credentials for Sheets API");
}

function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: getServiceAccount(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

/** List all sheet titles in the spreadsheet. */
async function listSheetTitles(spreadsheetId = LEADS_SHEET_ID) {
  const sheets = sheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(title))" });
  return (meta.data.sheets || []).map((s) => s.properties.title);
}

/** Fetch one sheet as an array of objects (header row → keys). */
async function fetchSheetRows(sheetTitle, spreadsheetId = LEADS_SHEET_ID) {
  const sheets = sheetsClient();
  // Quote title for ranges with spaces / Ukrainian chars
  const range = `'${sheetTitle}'!A:Z`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i] ?? null; });
    return obj;
  });
}

/** Fetch leads from every sheet in the spreadsheet, deduplicated by lead `id`. */
export async function fetchAllLeads() {
  const titles = await listSheetTitles();
  const seen = new Map();
  for (const title of titles) {
    let rows = [];
    try { rows = await fetchSheetRows(title); }
    catch (e) { console.warn(`[leads] failed to read sheet "${title}": ${e.message}`); continue; }
    for (const r of rows) {
      const id = String(r.id || "").trim();
      if (!id) continue;
      if (!seen.has(id)) seen.set(id, { ...r, _sheet: title });
    }
  }
  return [...seen.values()];
}

/* ───────────── Normalization ───────────── */

function sanitizeId(raw) {
  // Firestore disallows: / . # $ [ ] — also replace ":"
  return String(raw || "").replace(/[\/.#$\[\]:]/g, "_").trim();
}

function normalizePhone(raw) {
  if (!raw) return "";
  return String(raw).replace(/^p:/i, "").trim();
}

function normalizeEnglishLevel(raw) {
  if (!raw) return null;
  const r = String(raw).toLowerCase();
  if (r.includes("с1") || r.includes("c1") || r.includes("вище")) return "C1";
  if (r.includes("b2") || r.includes("в2") || r.includes("стабільн")) return "B2";
  if (r.includes("b1") || r.includes("в1") || r.includes("орієнтов")) return "B1";
  if (r.includes("a2") || r.includes("а2")) return "A2";
  if (r.includes("a1") || r.includes("а1") || r.includes("початков")) return "A1";
  return null;
}

function normalizeRole(row) {
  const text = `${row.campaign_name || ""} ${row.ad_name || ""} ${row.adset_name || ""}`.toLowerCase();
  if (text.includes("дисп")) return "Dispatcher";
  if (text.includes("фліт") || text.includes("флит") || text.includes("fleet")) return "Fleet";
  return "Dispatcher"; // default — form is "Найм дисппів"
}

function buildNote(row) {
  const parts = [];
  const eng = row["як_у_тебе_з_англійською?"];
  if (eng) parts.push(`English: ${eng}`);
  const knowledge = row["щось_знаєш_про_американську_логістику?"];
  if (knowledge) parts.push(`Знає про логістику: ${knowledge}`);
  if (row.campaign_name) parts.push(`Кампанія: ${row.campaign_name}`);
  return parts.join("\n\n");
}

/** Map a sheet row to the dispatcher shape used in Firestore. */
export function normalizeLead(row) {
  const leadId = sanitizeId(row.id);
  if (!leadId) return null;

  const phone     = normalizePhone(row.phone);
  const telegram  = String(row["твій_нікнейм__або_номер_в_телеграм?"] || "").trim();
  const name      = String(row.full_name || "").trim();
  const role      = normalizeRole(row);
  const english   = normalizeEnglishLevel(row["як_у_тебе_з_англійською?"]);
  const note      = buildNote(row);

  // Use the lead's created_time as the visible createdAt (YYYY-MM-DD)
  let createdAt = new Date().toISOString().slice(0, 10);
  if (row.created_time) {
    const d = new Date(row.created_time);
    if (!Number.isNaN(d.getTime())) createdAt = d.toISOString().slice(0, 10);
  }

  return {
    id: `lead_${leadId}`,
    name: name || telegram || phone || "(no name)",
    telegram,
    phone,
    note,
    role,
    stage: "new_lead",
    englishLevel: english,
    source: "meta_ads",
    sourceSheet: row._sheet || null,
    sourceLeadId: row.id || null,
    campaign: row.campaign_name || null,
    createdAt,
    createdTime: row.created_time || null,
  };
}

/* ───────────── Telegram notification ───────────── */

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildLeadMessage(lead, rawRow) {
  const lines = [`🆕 <b>Новий лід — ${escapeHtml(lead.role)}</b>`, ""];
  lines.push(`👤 <b>${escapeHtml(lead.name || "(no name)")}</b>`);
  if (lead.phone) {
    const phoneDisplay = escapeHtml(lead.phone);
    lines.push(`📞 <a href="tel:${phoneDisplay}">${phoneDisplay}</a>`);
  }
  if (lead.telegram) {
    const tg = lead.telegram.replace(/^@/, "");
    // If it looks like a username (no spaces, no plus), link it
    if (/^[A-Za-z0-9_.]+$/.test(tg)) {
      lines.push(`📱 Telegram: <a href="https://t.me/${tg}">@${escapeHtml(tg)}</a>`);
    } else {
      lines.push(`📱 Telegram: ${escapeHtml(lead.telegram)}`);
    }
  }
  if (lead.englishLevel) lines.push(`🇬🇧 English: <b>${escapeHtml(lead.englishLevel)}</b>`);
  if (lead.campaign)     lines.push(`📺 Кампанія: ${escapeHtml(lead.campaign)}`);

  const knowledge = rawRow["щось_знаєш_про_американську_логістику?"];
  if (knowledge) {
    lines.push("");
    lines.push(`💬 ${escapeHtml(knowledge)}`);
  }

  if (lead.createdTime) {
    const d = new Date(lead.createdTime);
    if (!Number.isNaN(d.getTime())) {
      lines.push("");
      lines.push(`<i>${d.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" })} (Kyiv)</i>`);
    }
  }
  return lines.join("\n");
}

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_HR_CHAT_ID;
  if (!token || !chatId) return; // silently skip if not configured

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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram ${res.status}: ${body}`);
  }
}

/* ───────────── Sync ───────────── */

/**
 * Insert new leads into the `dispatchers` collection. Skips any whose Firestore
 * doc already exists — never overwrites stage / note changes made by humans.
 * Sends a separate Telegram message to the HR chat for each new lead written.
 *
 * Returns { written, skipped, notified, errors }.
 */
export async function syncLeadsToFirestore(db, rawLeads) {
  const report = { written: 0, skipped: 0, notified: 0, errors: [] };

  // Read existing lead-IDs only (much cheaper than reading the full collection)
  const existing = new Set();
  try {
    const snap = await db.collection("dispatchers").get();
    snap.forEach((d) => existing.add(d.id));
  } catch (e) {
    report.errors.push(`read dispatchers: ${e.message}`);
    return report;
  }

  // Collect new leads for both writing AND telegram notification
  const newLeads = []; // [{ normalized, raw }]
  for (const raw of rawLeads) {
    const normalized = normalizeLead(raw);
    if (!normalized) { report.skipped++; continue; }
    if (existing.has(normalized.id)) { report.skipped++; continue; }
    newLeads.push({ normalized, raw });
  }

  // Batch-write all new leads
  let batch = db.batch();
  let count = 0;
  const commits = [];
  for (const { normalized } of newLeads) {
    batch.set(db.collection("dispatchers").doc(normalized.id), normalized);
    count++;
    report.written++;
    if (count >= 400) {
      commits.push(batch);
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) commits.push(batch);
  for (const b of commits) {
    try { await b.commit(); }
    catch (e) { report.errors.push(`batch commit: ${e.message}`); }
  }

  // Send Telegram notification per new lead (sequential — Telegram has 30 msgs/sec limit)
  for (const { normalized, raw } of newLeads) {
    try {
      await sendTelegramMessage(buildLeadMessage(normalized, raw));
      report.notified++;
      // Small delay to stay well under Telegram's rate limits
      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      report.errors.push(`telegram for ${normalized.id}: ${e.message}`);
    }
  }

  return report;
}
