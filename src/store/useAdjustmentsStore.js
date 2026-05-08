import { create } from "zustand";
import { db, auth } from "../lib/firebase";
import {
  collection, query, where, onSnapshot,
  addDoc, doc, deleteDoc, updateDoc,
} from "firebase/firestore";

/**
 * Manual adjustments for a driver — extra pay / extra miles not tracked in TMS.
 * Use cases:
 *  - "Helped recovery move" — extra miles + extra pay
 *  - "Repositioning truck" — extra empty miles
 *  - "Bonus for difficult load" — extra pay only
 *
 * Adjustments are scoped to a specific (driverName, weekKey) so they
 * naturally roll into that week's totals.
 */
export const useAdjustmentsStore = create((set, get) => ({
  entries: [],          // [{ id, driverName, weekKey, isoDay, loadedMiles, emptyMiles, amount, note, ... }]
  isLoading: false,
  _unsub: null,
  _sub: null,           // "driverName::weekKey"

  subscribeForDriverWeek: (driverName, weekKey) => {
    const sub = `${driverName}::${weekKey}`;
    const { _unsub, _sub } = get();
    if (_sub === sub && _unsub) return;
    if (_unsub) _unsub();

    if (!driverName || !weekKey) {
      set({ entries: [], _sub: null, _unsub: null });
      return;
    }

    set({ isLoading: true, _sub: sub, entries: [] });

    const q = query(
      collection(db, "driverAdjustments"),
      where("driverName", "==", driverName),
      where("weekKey", "==", weekKey),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // sort by isoDay ascending
        entries.sort((a, b) => String(a.isoDay || "").localeCompare(String(b.isoDay || "")));
        set({ entries, isLoading: false });
      },
      () => set({ isLoading: false }),
    );

    set({ _unsub: unsub });
  },

  unsubscribe: () => {
    const u = get()._unsub;
    if (u) u();
    set({ _unsub: null, _sub: null, entries: [] });
  },

  /** Create a new adjustment entry. */
  addAdjustment: async ({ driverName, weekKey, isoDay, loadedMiles = 0, emptyMiles = 0, amount = 0, note = "" }) => {
    return addDoc(collection(db, "driverAdjustments"), {
      driverName,
      weekKey,
      isoDay,
      loadedMiles: Number(loadedMiles) || 0,
      emptyMiles:  Number(emptyMiles)  || 0,
      amount:      Number(amount)      || 0,
      note:        String(note || ""),
      createdAt:   new Date().toISOString(),
      createdBy:   auth?.currentUser?.email || null,
    });
  },

  updateAdjustment: async (id, patch) => {
    const clean = { ...patch };
    ["loadedMiles", "emptyMiles", "amount"].forEach((k) => {
      if (clean[k] != null) clean[k] = Number(clean[k]) || 0;
    });
    await updateDoc(doc(db, "driverAdjustments", id), clean);
  },

  removeAdjustment: async (id) => {
    await deleteDoc(doc(db, "driverAdjustments", id));
  },
}));
