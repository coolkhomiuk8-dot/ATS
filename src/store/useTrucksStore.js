import { create } from "zustand";
import { db, ensureAuthReady, isFirebaseConfigured } from "../lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";

function ensureTruckShape(truck) {
  return {
    id: "",
    unitNumber: "",
    year: "",
    maxWeight: "",
    vinNumber: "",
    truckCompany: "SKP BROKERAGE",
    eldId: "",
    status: "active",
    statusNote: "",
    homeLocation: "",
    fuelCard: "",
    lastOilChange: 0,
    currentOdometer: 0,
    assignedDriverId: null,
    notes: "",
    docs: {},
    files: [],
    createdAt: null,
    ...truck,
  };
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    const next = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) return;
      next[key] = stripUndefined(entry);
    });
    return next;
  }
  return value;
}

export const useTrucksStore = create((set, get) => ({
  trucks: [],
  isLoading: false,
  syncError: null,
  _unsub: null,

  subscribeTrucks: () => {
    if (get()._unsub) return;
    if (!isFirebaseConfigured || !db) {
      set({ syncError: "Firebase is not configured.", isLoading: false });
      return;
    }

    set({ isLoading: true, syncError: null });

    const unsub = onSnapshot(
      collection(db, "trucks"),
      (snapshot) => {
        const trucks = snapshot.docs
          .map((snap) => ensureTruckShape({ ...snap.data(), id: snap.id }))
          .sort((a, b) => String(a.unitNumber).localeCompare(String(b.unitNumber), undefined, { numeric: true }));
        set({ trucks, isLoading: false, syncError: null });
      },
      (error) => {
        set({ isLoading: false, syncError: error.message || "Failed to sync trucks." });
      },
    );

    set({ _unsub: unsub });
  },

  unsubscribeTrucks: () => {
    const unsub = get()._unsub;
    if (unsub) unsub();
    set({ _unsub: null });
  },

  addTruck: async (data) => {
    const id = `truck_${Date.now()}`;
    const truck = ensureTruckShape({
      ...data,
      id,
      createdAt: new Date().toISOString().split("T")[0],
    });

    set((state) => ({ trucks: [...state.trucks, truck] }));

    if (!isFirebaseConfigured || !db) return;
    try {
      await ensureAuthReady();
      await setDoc(doc(db, "trucks", id), stripUndefined(truck));
    } catch (error) {
      set({ syncError: error.message || "Failed to create truck." });
    }
  },

  updateTruck: async (id, data) => {
    const patch = stripUndefined(data);
    set((state) => ({
      trucks: state.trucks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));

    if (!isFirebaseConfigured || !db) return;
    try {
      await ensureAuthReady();
      await updateDoc(doc(db, "trucks", id), patch);
    } catch (error) {
      set({ syncError: error.message || "Failed to update truck." });
    }
  },

  deleteTruck: async (id) => {
    set((state) => ({ trucks: state.trucks.filter((t) => t.id !== id) }));

    if (!isFirebaseConfigured || !db) return;
    try {
      await ensureAuthReady();
      await deleteDoc(doc(db, "trucks", id));
    } catch (error) {
      set({ syncError: error.message || "Failed to delete truck." });
    }
  },

  assignDriver: async (truckId, driverId) => {
    return get().updateTruck(truckId, { assignedDriverId: driverId });
  },

  unassignDriver: async (truckId) => {
    return get().updateTruck(truckId, { assignedDriverId: null });
  },
}));
