// Scheduled at 12:00 UTC = 08:00 AM Eastern Time (EDT, UTC-4), Mon–Fri —
// before the workday's own 9am check-in. Flags anyone who's been below the
// minimum-acceptable pace (30/day) for 3+ consecutive COMPLETE days — a
// distinct, more urgent signal than the midday/EOD "0 today" nudges, which
// only catch a single bad day.

import { getChronicUnderperformers, sendToOwner } from "./_call-stats.js";

export const handler = async () => {
  const day = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" });
  if (day === "Sat" || day === "Sun") return { statusCode: 200, body: "Weekend — skipped" };

  const chronic = await getChronicUnderperformers(3);
  if (chronic.length === 0) return { statusCode: 200, body: "No chronic underperformers" };

  let msg = `🔴 <b>Хронічно нижче мінімуму (30/день), 3+ дні поспіль</b>\n\n`;
  for (const p of chronic) {
    msg += `  • <b>${p.name}</b> (${p.account}): ${p.counts.join(" → ")}\n`;
  }
  await sendToOwner(msg.trimEnd());

  return { statusCode: 200, body: `${chronic.length} chronic underperformers flagged` };
};
