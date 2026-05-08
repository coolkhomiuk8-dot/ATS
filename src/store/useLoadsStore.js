import { create } from "zustand";
import { db, isFirebaseConfigured } from "../lib/firebase";
import { collection, onSnapshot, query, where, getDocs, orderBy, limit } from "firebase/firestore";

/**
 * Compute Mon-00:00 EST → Sun-23:59 EST date range for a given week key
 * (e.g. "2026-W18"). Returns { start, end, label } where start/end are
 * ISO strings in UTC corresponding to those EST boundaries.
 */
export function weekRangeFromKey(weekKey) {
  if (!weekKey) return null;
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return null;
  const year = +m[1];
  const week = +m[2];

  // Jan 4 is always in week 1 (ISO 8601)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  // Roll back to Monday of week 1
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // 0 = Mon
  const week1Mon = new Date(Date.UTC(year, 0, 4 - jan4Day));
  // Add (week-1) weeks
  const monday = new Date(week1Mon.getTime() + (week - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000 + 86399999);

  const fmt = (d) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
  return {
    start: monday.toISOString(),
    end:   sunday.toISOString(),
    label: `${fmt(monday)} – ${fmt(sunday)}`,
    monday,
    sunday,
  };
}

/**
 * Compute the current week key in EST.
 */
export function currentWeekKey() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const wdMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const fromMon = wdMap[parts.weekday] ?? 0;
  let y = +parts.year, mo = +parts.month, d = +parts.day - fromMon;
  while (d < 1) {
    mo -= 1;
    if (mo < 1) { mo = 12; y -= 1; }
    d += new Date(y, mo, 0).getDate();
  }
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // 0 = Mon
  const week1Mon = new Date(Date.UTC(y, 0, 4 - jan4Day));
  const target = new Date(Date.UTC(y, mo - 1, d));
  const diffDays = Math.round((target - week1Mon) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  return `${y}-W${String(week).padStart(2, "0")}`;
}

/**
 * Add/subtract weeks from a week key.
 */
export function shiftWeekKey(weekKey, delta) {
  const range = weekRangeFromKey(weekKey);
  if (!range) return weekKey;
  const newMonday = new Date(range.monday.getTime() + delta * 7 * 86400000);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(newMonday).map((p) => [p.type, p.value]));
  const y = +parts.year, mo = +parts.month, d = +parts.day;
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(Date.UTC(y, 0, 4 - jan4Day));
  const target = new Date(Date.UTC(y, mo - 1, d));
  const diffDays = Math.round((target - week1Mon) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  return `${y}-W${String(week).padStart(2, "0")}`;
}

/**
 * Loads that haven't been picked up yet — kept separate from confirmed
 * loads in the UI (shown as a "Pending" section). Includes both freshly
 * booked ("new") and en-route-to-pickup ("rolling to pu").
 */
const PENDING_STATUSES = new Set(["new", "rolling to pu", "rolling to pickup"]);
export function isPendingLoad(l) {
  const s = String(l?.status || "").toLowerCase().trim();
  return PENDING_STATUSES.has(s);
}

/**
 * Fetch loads matching any of the given weekKeys (Firestore `in` allows up to 30).
 * Returns plain load objects (not subscribed). For monthly aggregates etc.
 */
export async function fetchLoadsForWeeks(weekKeys) {
  if (!isFirebaseConfigured || !db) return [];
  if (!Array.isArray(weekKeys) || weekKeys.length === 0) return [];
  // Firestore `in` operator caps at 30 values
  const chunks = [];
  for (let i = 0; i < weekKeys.length; i += 30) chunks.push(weekKeys.slice(i, i + 30));
  const all = [];
  for (const chunk of chunks) {
    const q = query(collection(db, "loads"), where("weekKey", "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => all.push({ id: d.id, ...d.data() }));
  }
  return all;
}

/**
 * Find the most recent weekKey that has loads in Firestore.
 * Returns null if collection is empty or on error.
 */
export async function findLatestWeekKey() {
  if (!isFirebaseConfigured || !db) return null;
  try {
    const snap = await getDocs(
      query(collection(db, "loads"), orderBy("puDate", "desc"), limit(1))
    );
    if (snap.empty) return null;
    return snap.docs[0].data().weekKey || null;
  } catch {
    return null;
  }
}

export const useLoadsStore = create((set, get) => ({
  loads: [],
  isLoading: false,
  syncError: null,
  _unsub: null,
  _subscribedWeek: null,

  subscribeLoads: (weekKey) => {
    const { _unsub, _subscribedWeek } = get();

    // Already subscribed to this exact week — nothing to do
    if (_subscribedWeek === weekKey && _unsub) return;

    // Unsubscribe from previous week
    if (_unsub) _unsub();

    if (!isFirebaseConfigured || !db) {
      set({ syncError: "Firebase is not configured.", isLoading: false });
      return;
    }

    set({ isLoading: true, syncError: null, loads: [], _subscribedWeek: weekKey });

    const q = query(
      collection(db, "loads"),
      where("weekKey", "==", weekKey)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const loads = snapshot.docs
          .map((snap) => ({ id: snap.id, ...snap.data() }))
          .sort((a, b) => String(b.puDate || "").localeCompare(String(a.puDate || "")));
        set({ loads, isLoading: false, syncError: null });
      },
      (error) => {
        set({ isLoading: false, syncError: error.message || "Failed to sync loads." });
      },
    );

    set({ _unsub: unsub });
  },

  unsubscribeLoads: () => {
    const unsub = get()._unsub;
    if (unsub) unsub();
    set({ _unsub: null, _subscribedWeek: null });
  },
}));
