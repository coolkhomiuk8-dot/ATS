/**
 * analyze-images.mjs
 * Processes Telegram chat export photos:
 * - Classifies each photo: DAT / Google Maps / Other
 * - Extracts rate/lane data from DAT screenshots
 * - Extracts route data from Google Maps screenshots
 * - Links with Roman's reply comments
 * - Saves results to image_knowledge.json
 */

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

// ── Config ─────────────────────────────────────────────────────────────────────

const EXPORT_DIR = 'C:/Users/user/Downloads/ChatExport_2026-04-11';
const OUTPUT_FILE = 'C:/Users/user/Desktop/ATS/scripts/image_knowledge.json';
const ROMAN_ID = 'user384588590';

// Read API key directly from .env
function getApiKey() {
  const envPath = path.join('C:/Users/user/Desktop/dispatcher-ai/backend', '.env');
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^ANTHROPIC_API_KEY=(.+)$/);
    if (m) return m[1].trim();
  }
  throw new Error('ANTHROPIC_API_KEY not found');
}

const client = new Anthropic({ apiKey: getApiKey() });

// ── Load chat data ─────────────────────────────────────────────────────────────

console.log('📂 Loading chat export...');
const raw = fs.readFileSync(path.join(EXPORT_DIR, 'result.json'), 'utf8');
const chat = JSON.parse(raw);
const messages = chat.messages.filter(m => m.type === 'message');

// Build message lookup by id
const msgById = {};
for (const m of messages) msgById[m.id] = m;

// ── Find photos + Roman's replies ──────────────────────────────────────────────

const photoMessages = messages.filter(m => m.photo);

// Map: photo_msg_id → roman's reply text
const romanReplies = {};
for (const m of messages) {
  if (m.from_id === ROMAN_ID && m.reply_to_message_id && msgById[m.reply_to_message_id]?.photo) {
    const text = Array.isArray(m.text)
      ? m.text.map(t => typeof t === 'string' ? t : t.text || '').join('')
      : (m.text || '');
    if (text.trim()) {
      if (!romanReplies[m.reply_to_message_id]) romanReplies[m.reply_to_message_id] = [];
      romanReplies[m.reply_to_message_id].push(text.trim());
    }
  }
}

console.log(`📸 Total photos: ${photoMessages.length}`);
console.log(`💬 Photos with Roman's replies: ${Object.keys(romanReplies).length}`);

// Prioritize photos that have Roman's replies, then process others
const prioritized = [
  ...photoMessages.filter(m => romanReplies[m.id]),
  ...photoMessages.filter(m => !romanReplies[m.id]),
];

// ── Image helpers ──────────────────────────────────────────────────────────────

function imageToBase64(relativePath) {
  const fullPath = path.join(EXPORT_DIR, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  const buf = fs.readFileSync(fullPath);
  return buf.toString('base64');
}

function getMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

// Parse JSON from model response — handles raw JSON, ```json blocks, and partial wraps
function parseJSON(text) {
  if (!text) return null;
  // Try stripping markdown code blocks first
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  // Try to find JSON object
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// API call with retry on rate limit
async function callWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 429 || err.message?.includes('rate')) {
        const wait = (i + 1) * 5000;
        process.stdout.write(` [rate limit, wait ${wait/1000}s] `);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// ── Step 1: Classify image with Haiku (cheap) ─────────────────────────────────

async function classifyImage(base64, mediaType) {
  const resp = await callWithRetry(() => client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'What is this image? Reply with exactly one word: DAT, MAPS, or OTHER. DAT = load board screenshot (DAT, Truckstop, rate data). MAPS = Google Maps or navigation route. OTHER = anything else.' }
      ]
    }]
  }));
  return resp.content[0]?.text?.trim().toUpperCase().replace(/[^A-Z]/g, '') || 'OTHER';
}

// ── Step 2: Extract DAT data ───────────────────────────────────────────────────

async function extractDATData(base64, mediaType, romanComment) {
  const prompt = romanComment
    ? `This is a DAT or load board screenshot. Extract rate/lane info.
Roman's comment: "${romanComment}"

Respond in JSON only (no markdown, no explanation):
{"origin":"City ST","destination":"City ST","rate_per_mile":0.00,"total_rate":0,"miles":0,"load_count":null,"roman_verdict":"quote","roman_sentiment":"positive/negative/neutral","notes":""}`
    : `This is a DAT or load board screenshot. Extract rate/lane info.

Respond in JSON only (no markdown, no explanation):
{"origin":"City ST","destination":"City ST","rate_per_mile":0.00,"total_rate":0,"miles":0,"load_count":null,"notes":""}`;

  const resp = await callWithRetry(() => client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: prompt }
      ]
    }]
  }));

  return parseJSON(resp.content[0]?.text || '');
}

// ── Step 3: Extract Google Maps data ──────────────────────────────────────────

async function extractMapsData(base64, mediaType, romanComment) {
  const prompt = romanComment
    ? `This is a Google Maps or navigation screenshot. Extract route information.
Roman's comment: "${romanComment}"

Respond in JSON only (no markdown):
{"origin":"City ST","destination":"City ST","distance_miles":0,"drive_time_hours":0.0,"route_notes":"highways","roman_comment":"exact quote","roman_sentiment":"positive/negative/neutral"}`
    : `This is a Google Maps or navigation screenshot. Extract route information.

Respond in JSON only (no markdown):
{"origin":"City ST","destination":"City ST","distance_miles":0,"drive_time_hours":0.0,"route_notes":"highways"}`;

  const resp = await callWithRetry(() => client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: prompt }
      ]
    }]
  }));

  return parseJSON(resp.content[0]?.text || '');
}

// ── Main processing loop ───────────────────────────────────────────────────────

async function main() {
  const results = { dat: [], maps: [], processed: 0, skipped: 0, errors: 0 };

  // Load existing progress if any
  let startFrom = 0;
  if (fs.existsSync(OUTPUT_FILE)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    results.dat = existing.dat || [];
    results.maps = existing.maps || [];
    results.processed = existing.processed || 0;
    startFrom = results.processed;
    console.log(`\n♻️  Resuming from image ${startFrom}...`);
  }

  const toProcess = prioritized.slice(startFrom);
  console.log(`\n🚀 Processing ${toProcess.length} images (${prioritized.length - startFrom} remaining)...\n`);

  for (let i = 0; i < toProcess.length; i++) {
    const msg = toProcess[i];
    const globalIdx = startFrom + i + 1;
    const total = prioritized.length;
    const romanComment = romanReplies[msg.id]?.join(' | ') || null;

    process.stdout.write(`[${globalIdx}/${total}] ${msg.photo} `);

    // Load image
    const base64 = imageToBase64(msg.photo);
    if (!base64) {
      console.log('❌ file missing');
      results.skipped++;
      results.processed++;
      continue;
    }

    const mediaType = getMediaType(msg.photo);

    try {
      // Step 1: Classify
      const category = await classifyImage(base64, mediaType);
      process.stdout.write(`→ ${category} `);

      if (category === 'DAT') {
        const data = await extractDATData(base64, mediaType, romanComment);
        if (data) {
          data.source_msg_id = msg.id;
          data.date_sent = msg.date;
          results.dat.push(data);
          console.log(`✅ ${data.origin || '?'} → ${data.destination || '?'} $${data.rate_per_mile || '?'}/mi`);
        } else {
          console.log('⚠️  extract failed');
        }
      } else if (category === 'MAPS') {
        const data = await extractMapsData(base64, mediaType, romanComment);
        if (data) {
          data.source_msg_id = msg.id;
          data.date_sent = msg.date;
          results.maps.push(data);
          console.log(`✅ ${data.origin || '?'} → ${data.destination || '?'} ${data.distance_miles || '?'}mi`);
        } else {
          console.log('⚠️  extract failed');
        }
      } else {
        console.log('skip');
        results.skipped++;
      }

      results.processed++;

      // Save progress every 20 images
      if (results.processed % 20 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
        console.log(`\n💾 Progress saved (${results.dat.length} DAT, ${results.maps.length} Maps)\n`);
      }

      // Rate limit: ~1 req/sec (2 calls per image max)
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
      results.errors++;
      results.processed++;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');

  console.log('\n═══════════════════════════════════════');
  console.log(`✅ Done!`);
  console.log(`   DAT screenshots processed: ${results.dat.length}`);
  console.log(`   Google Maps processed:     ${results.maps.length}`);
  console.log(`   Skipped (other):           ${results.skipped}`);
  console.log(`   Errors:                    ${results.errors}`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log('═══════════════════════════════════════');
}

main().catch(console.error);
