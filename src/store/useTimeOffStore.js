import { create } from "zustand";
import { db, auth } from "../lib/firebase";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";

/**
 * Sanitize a free-text key (driver name) into a valid Firestore doc-ID segment.
 * Firestore disallows: / . # $ [ ] and we also strip whitespace.
 */
export function sanitizeId(s) {
  return String(s || "")
    .trim()
    .replace(/[\/.#$\[\]]/g, "_")
    .replace(/\s+/g, "_");
}

export function timeOffDocId(driverName, isoDay) {
  return `${sanitizeId(driverName)}__${isoDay}`;
}

/**
 * Store of time-off entries for a single driver.
 * Subscription replaces the previous one when subscribeForDriver is called
 * with a different name.
 */
export const useTimeOffStore = create((set, get) => ({
  entries: [],          // [{ id, driverName, isoDay, type, note, createdAt, createdBy }]
  isLoading: false,
  _unsub: null,
  _subscribedDriver: null,

  subscribeForDriver: (driverName) => {
    const { _unsub, _subscribedDriver } = get();
    if (_subscribedDriver === driverName && _unsub) return;
    if (_unsub) _unsub();

    if (!driverName) {
      set({ entries: [], _subscribedDriver: null, _unsub: null });
      return;
    }

    set({ isLoading: true, _subscribedDriver: driverName, entries: [] });

    const q = query(
      collection(db, "driverTimeOff"),
      where("driverName", "==", driverName),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        set({ entries, isLoading: false });
      },
      () => set({ isLoading: false }),
    );

    set({ _unsub: unsub });
  },

  unsubscribe: () => {
    const u = get()._unsub;
    if (u) u();
    set({ _unsub: null, _subscribedDriver: null, entries: [] });
  },

  /** Add or update a time-off day. */
  markTimeOff: async (driverName, isoDay, { type = "home", note = "" } = {}) => {
    const id = timeOffDocId(driverName, isoDay);
    await setDoc(
      doc(db, "driverTimeOff", id),
      {
        driverName,
        isoDay,
        type,
        note: String(note || ""),
        createdAt: new Date().toISOString(),
        createdBy: auth?.currentUser?.email || null,
      },
      { merge: true },
    );
  },

  /** Remove a time-off day. */
  removeTimeOff: async (id) => {
    await deleteDoc(doc(db, "driverTimeOff", id));
  },
}));
