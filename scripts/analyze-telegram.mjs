/**
 * Telegram Chat Analyzer for Dispatcher Decision Assistant
 */

import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const INPUT_FILE = 'C:\\Users\\user\\Downloads\\Telegram Desktop\\ChatExport_2026-04-10\\result.json';
const OUTPUT_PATTERNS = path.join(__dirname, 'dispatcher_patterns.json');
const OUTPUT_SYSTEM_PROMPT = path.join(__dirname, 'system_prompt_chat.txt');
const CHUNK_SIZE = 150;

const KEYWORDS = [
  'load', 'rpm', 'rate', 'broker', 'pickup', 'pick up', 'delivery',
  'mile', 'cancel', 'tonu', 'detention', 'stuck', 'deadhead',
  'take it', 'good load', 'bad load', 'gross', 'lane', 'state',
  'go to', 'relocate', 'reposition', 'negotiate', 'per mile',
  'лоад', 'груз', 'вантаж', 'брокер', 'ціна', 'рейт', 'доставка',
  'міль', 'скасув', 'локація', 'штат', 'їхати', 'застряг', 'брати',
  'не брати', 'переговор', 'дорожче', 'дешево',
  '$', '/mi', '/mile',
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function extractText(msg) {
  if (typeof msg.text === 'string') return msg.text;
  if (Array.isArray(msg.text)) {
    return msg.text.map(t => (typeof t === 'string' ? t : t.text || '')).join('');
  }
  return '';
}

function isRelevant(msg) {
  const text = extractText(msg);
  if (!text || text.length < 5) return false;
  const lower = text.toLowerCase();
  return KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function formatMessages(messages) {
  return messages.map(m => {
    const sender = m.from || m.actor || 'Unknown';
    const text = extractText(m);
    const date = m.date ? m.date.substring(0, 10) : '';
    return `[${date}] ${sender}: ${text}`;
  }).join('\n');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── ANALYZE CHUNK ───────────────────────────────────────────────────────────

async function analyzeChunk(client, messages, index, total) {
  const text = formatMessages(messages);
  process.stdout.write(`  Chunk ${index + 1}/${total}... `);

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are analyzing Telegram messages from a trucking dispatcher company.
Extract ONLY what is clearly present in these messages.

Return a JSON object:
{
  "decisions": [{ "situation": "...", "action": "take|reject|negotiate", "reason": "...", "quote": "exact text" }],
  "pricing_rules": ["rule, e.g. 'Below $1.80 RPM is bad'"],
  "broker_notes": [{ "broker": "name", "note": "opinion", "quote": "exact text" }],
  "lane_notes": [{ "lane": "state or city", "note": "good/bad/risky and why", "quote": "exact text" }],
  "style_samples": ["exact short quotes showing communication style"],
  "rules": ["recurring rules or policies"]
}

Return ONLY valid JSON. Empty arrays if nothing relevant.

MESSAGES:
${text}`,
    }],
  });

  const raw = response.content[0].text;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      process.stdout.write(`✓ (d:${(parsed.decisions||[]).length} b:${(parsed.broker_notes||[]).length} l:${(parsed.lane_notes||[]).length})\n`);
      return parsed;
    }
  } catch (_) {}

  process.stdout.write(`⚠ parse error\n`);
  return null;
}

// ─── GENERATE SYSTEM PROMPT ──────────────────────────────────────────────────

async function generateSystemPrompt(client, patterns) {
  console.log('\nGenerating system prompt...');

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    messages: [{
      role: 'user',
      content: `Based on these extracted patterns from a trucking dispatcher's Telegram messages, write a system prompt that makes an AI assistant think and talk like this dispatcher.

The system prompt must:
1. Capture the decision-making logic (when to take/reject/negotiate)
2. Reflect the pricing philosophy (what RPM is good/bad)
3. Include real opinions about brokers and lanes from the data
4. Match communication style (direct, short, mix of Ukrainian/English)
5. Include 5-8 concrete few-shot examples from actual quotes
6. Sound like an experienced human dispatcher, NOT an AI

Write in English. Be specific, not generic.

PATTERNS:
${JSON.stringify(patterns, null, 2)}`,
    }],
  });

  return response.content.find(b => b.type === 'text')?.text || '';
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log(`Loading: ${INPUT_FILE}`);
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('ERROR: File not found:', INPUT_FILE);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  } catch (e) {
    console.error('ERROR parsing JSON:', e.message);
    process.exit(1);
  }

  const all = data.messages || [];
  console.log(`Total messages: ${all.length.toLocaleString()}`);

  const relevant = all.filter(isRelevant);
  console.log(`Dispatcher-relevant: ${relevant.length.toLocaleString()}`);

  if (relevant.length === 0) {
    console.error('No relevant messages found.');
    process.exit(1);
  }

  const chunks = [];
  for (let i = 0; i < relevant.length; i += CHUNK_SIZE) {
    chunks.push(relevant.slice(i, i + CHUNK_SIZE));
  }

  console.log(`\nChunks: ${chunks.length} × ${CHUNK_SIZE} messages`);
  console.log(`Estimated cost: ~$${(chunks.length * 0.08).toFixed(2)}`);
  console.log('Starting in 5 seconds... (Ctrl+C to cancel)\n');
  await sleep(5000);

  const patterns = {
    decisions: [], pricing_rules: [], broker_notes: [],
    lane_notes: [], style_samples: [], rules: [],
  };

  for (let i = 0; i < chunks.length; i++) {
    try {
      const result = await analyzeChunk(client, chunks[i], i, chunks.length);
      if (result) {
        if (result.decisions)     patterns.decisions.push(...result.decisions);
        if (result.pricing_rules) patterns.pricing_rules.push(...result.pricing_rules);
        if (result.broker_notes)  patterns.broker_notes.push(...result.broker_notes);
        if (result.lane_notes)    patterns.lane_notes.push(...result.lane_notes);
        if (result.style_samples) patterns.style_samples.push(...result.style_samples);
        if (result.rules)         patterns.rules.push(...result.rules);
      }
      fs.writeFileSync(OUTPUT_PATTERNS, JSON.stringify(patterns, null, 2));
      if (i < chunks.length - 1) await sleep(800);
    } catch (e) {
      console.error(`  Chunk ${i + 1} error: ${e.message}`);
      await sleep(2000);
    }
  }

  patterns.pricing_rules = [...new Set(patterns.pricing_rules)];
  patterns.rules = [...new Set(patterns.rules)];
  patterns.style_samples = [...new Set(patterns.style_samples)].slice(0, 30);

  const systemPrompt = await generateSystemPrompt(client, patterns);
  fs.writeFileSync(OUTPUT_SYSTEM_PROMPT, systemPrompt);
  fs.writeFileSync(OUTPUT_PATTERNS, JSON.stringify(patterns, null, 2));

  console.log('\n' + '═'.repeat(50));
  console.log('✅  DONE');
  console.log('═'.repeat(50));
  console.log(`📊 scripts/dispatcher_patterns.json`);
  console.log(`🧠 scripts/system_prompt_chat.txt`);
  console.log(`\nDecisions:     ${patterns.decisions.length}`);
  console.log(`Pricing rules: ${patterns.pricing_rules.length}`);
  console.log(`Broker notes:  ${patterns.broker_notes.length}`);
  console.log(`Lane notes:    ${patterns.lane_notes.length}`);
  console.log(`Style samples: ${patterns.style_samples.length}`);
  console.log(`Rules:         ${patterns.rules.length}`);
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
