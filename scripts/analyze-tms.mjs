/**
 * analyze-tms.mjs
 * Deep analysis of all TMS loads → extracts patterns for system prompt
 */

import fs from 'fs';

const TMS_URL = 'https://haulcar.pro/api/integrations/netify';
const TMS_TOKEN = 'edb5dc765690b1a7e3d3e9d9582173a72d6c15a0e0c6df484ea56d9436a6137f99802d72a867650c';
const PAGE_SIZE = 100;

// ── Fetch all loads ────────────────────────────────────────────────────────────

async function fetchAllLoads() {
  const all = [];
  let offset = 0;
  let total = null;

  console.log('📡 Fetching loads from TMS...');
  while (true) {
    const res = await fetch(`${TMS_URL}?offset=${offset}&limit=${PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${TMS_TOKEN}` }
    });
    const data = await res.json();
    if (total === null) total = data.total;
    const items = data.items || [];
    all.push(...items);
    offset += PAGE_SIZE;
    process.stdout.write(`\r  ${all.length} / ${total} завантажено...`);
    if (offset >= total || items.length === 0) break;
  }
  console.log(`\n✅ Отримано ${all.length} вантажів`);
  return all;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function fmt(n) { return (n == null || isNaN(n)) ? '0.00' : Number(n).toFixed(2); }

// ── Filter valid loads ─────────────────────────────────────────────────────────

function validLoads(loads) {
  return loads.filter(l =>
    l.status !== 'Deleted' &&
    l.status !== 'Cancelled' &&
    l.rpm > 0 && l.rpm < 15 && // exclude outliers
    l.loadedMiles > 50 &&       // exclude very short/local
    l.delState && l.puState
  );
}

// ── Analysis ───────────────────────────────────────────────────────────────────

function analyzeStates(loads) {
  // Destination state performance
  const dest = {};
  const origin = {};

  for (const l of loads) {
    if (l.delState) {
      if (!dest[l.delState]) dest[l.delState] = [];
      dest[l.delState].push(l.rpm);
    }
    if (l.puState) {
      if (!origin[l.puState]) origin[l.puState] = [];
      origin[l.puState].push(l.rpm);
    }
  }

  const destStats = Object.entries(dest)
    .filter(([, v]) => v.length >= 3)
    .map(([state, rpms]) => ({
      state, count: rpms.length,
      avg: avg(rpms), medianRpm: median(rpms),
      min: Math.min(...rpms), max: Math.max(...rpms)
    }))
    .sort((a, b) => b.medianRpm - a.medianRpm);

  const originStats = Object.entries(origin)
    .filter(([, v]) => v.length >= 3)
    .map(([state, rpms]) => ({
      state, count: rpms.length,
      avg: avg(rpms), medianRpm: median(rpms)
    }))
    .sort((a, b) => b.medianRpm - a.medianRpm);

  return { dest: destStats, origin: originStats };
}

function analyzeBrokers(loads) {
  const brokers = {};
  for (const l of loads) {
    if (!l.broker) continue;
    const name = l.broker.trim();
    if (!brokers[name]) brokers[name] = { rpms: [], rates: [], count: 0 };
    brokers[name].rpms.push(l.rpm);
    brokers[name].rates.push(l.rate);
    brokers[name].count++;
  }

  return Object.entries(brokers)
    .filter(([, v]) => v.count >= 3)
    .map(([name, v]) => ({
      name, count: v.count,
      avgRpm: avg(v.rpms),
      medianRpm: median(v.rpms),
      avgRate: avg(v.rates)
    }))
    .sort((a, b) => b.count - a.count);
}

function analyzeLanes(loads) {
  const lanes = {};
  for (const l of loads) {
    if (!l.puState || !l.delState) continue;
    const key = `${l.puState} → ${l.delState}`;
    if (!lanes[key]) lanes[key] = [];
    lanes[key].push(l.rpm);
  }

  return Object.entries(lanes)
    .filter(([, v]) => v.length >= 3)
    .map(([lane, rpms]) => ({
      lane, count: rpms.length,
      medianRpm: median(rpms),
      avgRpm: avg(rpms)
    }))
    .sort((a, b) => b.count - a.count);
}

function analyzeDayOfWeek(loads) {
  const days = { 0:'Нд', 1:'Пн', 2:'Вт', 3:'Ср', 4:'Чт', 5:'Пт', 6:'Сб' };
  const dow = {};
  for (const l of loads) {
    if (!l.puDate) continue;
    const d = new Date(l.puDate).getDay();
    if (!dow[d]) dow[d] = [];
    dow[d].push(l.rpm);
  }
  return Object.entries(dow).map(([d, rpms]) => ({
    day: days[d], dayNum: +d,
    count: rpms.length, medianRpm: median(rpms)
  })).sort((a, b) => a.dayNum - b.dayNum);
}

function analyzeUnits(loads) {
  const units = {};
  for (const l of loads) {
    if (!l.unit) continue;
    const name = l.unit.trim();
    if (!units[name]) units[name] = { rpms: [], rates: [], miles: [] };
    units[name].rpms.push(l.rpm);
    units[name].rates.push(l.rate);
    units[name].miles.push(l.loadedMiles);
  }

  return Object.entries(units)
    .filter(([, v]) => v.rpms.length >= 5)
    .map(([name, v]) => ({
      name, count: v.rpms.length,
      medianRpm: median(v.rpms),
      avgRate: avg(v.rates),
      totalGross: Math.round(v.rates.reduce((a, b) => a + b, 0))
    }))
    .sort((a, b) => b.totalGross - a.totalGross);
}

function analyzeStuckRisk(loads) {
  // States where we deliver but struggle to find outbound
  const deliveries = {};
  const pickups = {};
  for (const l of loads) {
    if (l.delState) deliveries[l.delState] = (deliveries[l.delState] || 0) + 1;
    if (l.puState) pickups[l.puState] = (pickups[l.puState] || 0) + 1;
  }

  return Object.keys(deliveries)
    .filter(s => deliveries[s] >= 3)
    .map(s => ({
      state: s,
      deliveries: deliveries[s],
      pickups: pickups[s] || 0,
      ratio: (pickups[s] || 0) / deliveries[s]
    }))
    .sort((a, b) => a.ratio - b.ratio); // lowest ratio = hardest to escape
}

// ── Generate system prompt addition ───────────────────────────────────────────

function generatePrompt(states, brokers, lanes, dow, units, stuck, total) {
  const topDest = states.dest.slice(0, 15);
  const worstDest = states.dest.slice(-8).reverse();
  const topOrigin = states.origin.slice(0, 10);
  const topBrokers = brokers.filter(b => b.medianRpm >= 1.4).slice(0, 15);
  const badBrokers = brokers.filter(b => b.medianRpm < 1.2 && b.count >= 3).slice(0, 8);
  const topLanes = lanes.filter(l => l.medianRpm >= 1.5).slice(0, 20);
  const stuckStates = stuck.filter(s => s.ratio < 0.5 && s.deliveries >= 3).slice(0, 8);

  let out = `\n## АНАЛІЗ РЕАЛЬНИХ ${total} ВАНТАЖІВ З TMS\n\n`;

  // Destination states
  out += `### Топ штати призначення (по медіанному RPM):\n`;
  for (const s of topDest) {
    const icon = s.medianRpm >= 2.0 ? '✅' : s.medianRpm >= 1.5 ? '⚠️' : '❌';
    out += `${icon} **${s.state}**: $${fmt(s.medianRpm)}/mi median ($${fmt(s.min)}–$${fmt(s.max)}, ${s.count} вантажів)\n`;
  }

  out += `\n### Слабкі штати призначення (низький RPM):\n`;
  for (const s of worstDest) {
    out += `❌ **${s.state}**: $${fmt(s.medianRpm)}/mi median (${s.count} вантажів)\n`;
  }

  // Stuck risk
  if (stuckStates.length) {
    out += `\n### Штати де важко знайти зворотній вантаж (stuck risk):\n`;
    for (const s of stuckStates) {
      out += `⚠️ **${s.state}**: ${s.deliveries} deliveries, лише ${s.pickups} pickups — ratio ${fmt(s.ratio)}\n`;
    }
  }

  // Top origin states
  out += `\n### Найкращі штати відправки (high RPM outbound):\n`;
  for (const s of topOrigin.slice(0, 8)) {
    out += `✅ **${s.state}**: $${fmt(s.medianRpm)}/mi median outbound (${s.count} вантажів)\n`;
  }

  // Brokers
  out += `\n### Брокери з хорошим RPM (наш реальний досвід):\n`;
  for (const b of topBrokers) {
    out += `✅ ${b.name}: $${fmt(b.medianRpm)}/mi median (${b.count} вантажів, avg $${Math.round(b.avgRate)})\n`;
  }

  if (badBrokers.length) {
    out += `\n### Брокери з низьким RPM:\n`;
    for (const b of badBrokers) {
      out += `❌ ${b.name}: $${fmt(b.medianRpm)}/mi median (${b.count} вантажів)\n`;
    }
  }

  // Top lanes
  out += `\n### Найкращі лейни (state → state, медіанний RPM):\n`;
  for (const l of topLanes) {
    out += `✅ ${l.lane}: $${fmt(l.medianRpm)}/mi (${l.count} вантажів)\n`;
  }

  // Day of week
  out += `\n### RPM по днях тижня (реальні дані):\n`;
  for (const d of dow) {
    const icon = d.medianRpm >= 1.5 ? '✅' : d.medianRpm >= 1.3 ? '⚠️' : '❌';
    out += `${icon} ${d.day}: $${fmt(d.medianRpm)}/mi (${d.count} вантажів)\n`;
  }

  // Units
  out += `\n### Юніти по валовому доходу:\n`;
  for (const u of units.slice(0, 10)) {
    out += `🚛 ${u.name}: $${u.totalGross.toLocaleString()} gross, $${fmt(u.medianRpm)}/mi median (${u.count} вантажів)\n`;
  }

  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const raw = await fetchAllLoads();
  const loads = validLoads(raw);
  console.log(`\n📊 Валідних вантажів для аналізу: ${loads.length} / ${raw.length}`);

  console.log('🔍 Аналізую...');
  const states   = analyzeStates(loads);
  const brokers  = analyzeBrokers(loads);
  const lanes    = analyzeLanes(loads);
  const dow      = analyzeDayOfWeek(loads);
  const units    = analyzeUnits(loads);
  const stuck    = analyzeStuckRisk(loads);

  const prompt = generatePrompt(states, brokers, lanes, dow, units, stuck, loads.length);

  // Save
  fs.writeFileSync('C:/Users/user/Desktop/ATS/scripts/tms_knowledge.txt', prompt, 'utf8');
  console.log('\n' + prompt);
  console.log('\n✅ Збережено в tms_knowledge.txt');
}

main().catch(console.error);
