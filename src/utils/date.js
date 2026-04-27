export function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function getTodayPlus(days) {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().split("T")[0];
}

export function nextActionTs(driver) {
  if (!driver.nextAction) return Infinity;
  const time = driver.nextActionTime || "23:59";
  return new Date(`${driver.nextAction}T${time}`).getTime();
}

export function minutesUntil(driver) {
  if (!driver.nextAction) return null;
  const time = driver.nextActionTime || "23:59";
  return Math.round((new Date(`${driver.nextAction}T${time}`) - Date.now()) / 60000);
}

export function fmtDate(dateStr) {
  if (!dateStr) return "-";
  const raw = String(dateStr).slice(0, 10);
  const d = new Date(`${raw}T00:00:00`);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Returns expiry status info for a date string (YYYY-MM-DD).
 * daysLeft < 0 → expired; thresholds: 30 = orange, 60 = yellow, else green.
 */
export function expiryStatus(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr).slice(0, 10);
  const d = new Date(`${raw}T00:00:00`);
  if (isNaN(d)) return null;
  const daysLeft = Math.round((d - new Date()) / 86400000);

  if (daysLeft < 0) {
    return { daysLeft, color: "#dc2626", bg: "#fef2f2", border: "#fecaca",
      label: `Expired ${Math.abs(daysLeft)}d ago` };
  }
  if (daysLeft <= 30) {
    return { daysLeft, color: "#f97316", bg: "#fff7ed", border: "#fed7aa",
      label: `Expires in ${daysLeft}d` };
  }
  if (daysLeft <= 60) {
    return { daysLeft, color: "#f59e0b", bg: "#fffbeb", border: "#fde68a",
      label: `Expires in ${daysLeft}d` };
  }
  return { daysLeft, color: "#16a34a", bg: "#f0fdf4", border: "#86efac",
    label: `Valid · ${Math.floor(daysLeft / 30)}mo left` };
}

/**
 * Returns a human-readable tenure string from a hire date string (YYYY-MM-DD).
 */
export function tenureLabel(hireDateStr) {
  if (!hireDateStr) return null;
  const raw = String(hireDateStr).slice(0, 10);
  const d = new Date(`${raw}T00:00:00`);
  if (isNaN(d)) return null;
  const totalDays = Math.round((Date.now() - d) / 86400000);
  if (totalDays < 0) return null;
  if (totalDays < 7) return `${totalDays}d with us`;
  if (totalDays < 30) return `${Math.floor(totalDays / 7)}wk with us`;
  const months = Math.floor(totalDays / 30.44);
  if (months < 12) return `${months} mo with us`;
  const yrs = Math.floor(months / 12);
  const mo = months % 12;
  return mo > 0 ? `${yrs} yr ${mo} mo with us` : `${yrs} yr with us`;
}
