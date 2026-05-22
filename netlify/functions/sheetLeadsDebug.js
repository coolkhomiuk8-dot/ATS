import { getDb } from "./_auth.js";

const FAILED = [
  "lead_l_946186141481804","lead_l_2508686502884915","lead_l_2144790019677572",
  "lead_l_2010052706390074","lead_l_972596441885088","lead_l_964701196420478",
  "lead_l_1937436750311337","lead_l_1677248696637373","lead_l_1276875744430849",
  "lead_l_1496225631984792",
];

export const handler = async () => {
  const db = getDb();
  const results = [];
  for (const id of FAILED) {
    const doc = await db.collection("dispatchers").doc(id).get();
    if (!doc.exists) { results.push({ id, exists: false }); continue; }
    const d = doc.data();
    results.push({
      id,
      exists: true,
      notifiedAt: d.notifiedAt ?? null,
      stage: d.stage,
      name: d.name,
      hasName: !!d.name,
      source: d.source,
    });
  }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(results, null, 2) };
};
