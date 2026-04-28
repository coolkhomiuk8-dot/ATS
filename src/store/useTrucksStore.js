import { create } from "zustand";
import { db, auth, ensureAuthReady, isFirebaseConfigured } from "../lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const driveUploadTruckEndpoint = import.meta.env.VITE_DRIVE_UPLOAD_TRUCK_ENDPOINT || "/.netlify/functions/driveUploadTruck";
const driveDeleteEndpoint = import.meta.env.VITE_DRIVE_DELETE_ENDPOINT || "/.netlify/functions/driveDelete";

function sanitizeFileForDb(file) {
  const clean = {};
  const allowed = ["name", "type", "mime", "size", "date", "url", "data", "viewUrl", "contentUrl", "driveFileId", "folderId", "folderName", "linkedDoc", "category"];
  for (const key of allowed) {
    if (file[key] !== undefined && file[key] !== null) clean[key] = file[key];
  }
  return clean;
}

async function uploadTruckFile(truckId, fileObj) {
  if (!fileObj.rawFile) return sanitizeFileForDb(fileObj);

  if (!auth?.currentUser) throw new Error("Not authenticated. Sign in again.");
  const idToken = await auth.currentUser.getIdToken();

  const formData = new FormData();
  formData.append("file", fileObj.rawFile, fileObj.name);
  formData.append("truckId", String(truckId));

  const response = await fetch(driveUploadTruckEndpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Drive upload failed (${response.status}).`);
  }

  const payload = await response.json().catch(() => ({}));
  const viewUrl = payload.webViewLink || payload.url || "";
  const contentUrl = payload.webContentLink || "";
  const driveUrl = fileObj.type === "image" ? contentUrl || viewUrl : viewUrl || contentUrl;

  if (!driveUrl) throw new Error("Upload succeeded but no URL returned.");

  return sanitizeFileForDb({
    ...fileObj,
    url: driveUrl,
    data: driveUrl,
    viewUrl,
    contentUrl,
    driveFileId: payload.id || payload.fileId || null,
    folderId: payload.folderId || null,
    folderName: payload.folderName || null,
  });
}

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
    platesExpiry: "",
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

  addTruckFile: async (truckId, fileObj) => {
    const uploaded = await uploadTruckFile(truckId, fileObj);
    const truck = get().trucks.find((t) => t.id === truckId);
    if (!truck) return;
    const files = [...(truck.files || []), uploaded];
    return get().updateTruck(truckId, { files });
  },

  deleteTruckFile: async (truckId, fileIdx) => {
    const truck = get().trucks.find((t) => t.id === truckId);
    if (!truck) return;
    const file = (truck.files || [])[fileIdx];

    // Delete from Drive first (caller shows a spinner while waiting)
    if (file?.driveFileId && auth?.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        await fetch(driveDeleteEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ fileId: file.driveFileId }),
        });
      } catch (_) { /* non-critical */ }
    }

    // Remove from Firestore + local state after Drive confirms
    const files = (truck.files || []).filter((_, i) => i !== fileIdx);
    return get().updateTruck(truckId, { files });
  },
}));
