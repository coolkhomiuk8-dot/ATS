import { create } from "zustand";
import { SAMPLE_DRIVERS } from "../constants/data";
import { todayStr } from "../utils/date";
import { db, ensureAuthReady, isFirebaseConfigured, storage } from "../lib/firebase";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

function ensureDriverShape(driver) {
  return {
    id: Date.now(),
    name: "",
    phone: "",
    email: "",
    city: "",
    cdl: "A",
    exp: 0,
    source: "Other",
    stage: "new",
    nextAction: null,
    nextActionTime: "10:00",
    notes: [],
    files: [],
    docs: {},
    flags: [],
    interest: "Warm",
    lastContact: null,
    ...driver,
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

function sanitizeFileForDb(fileObj) {
  const { rawFile, ...rest } = fileObj;
  return stripUndefined(rest);
}

async function seedSampleDrivers() {
  const batch = writeBatch(db);
  SAMPLE_DRIVERS.forEach((driver) => {
    const safeDriver = ensureDriverShape(driver);
    batch.set(doc(db, "drivers", String(safeDriver.id)), safeDriver);
  });
  await batch.commit();
}

async function preflightFirestoreRead() {
  const probeQuery = query(collection(db, "drivers"), limit(1));

  const timeoutPromise = new Promise((_, reject) => {
    window.setTimeout(() => {
      reject(new Error("Firestore preflight timeout. Verify Firestore is enabled and rules allow reads."));
    }, 8000);
  });

  await Promise.race([getDocs(probeQuery), timeoutPromise]);
}

async function uploadDriverFile(driverId, fileObj) {
  if (!storage || !fileObj.rawFile) {
    return sanitizeFileForDb(fileObj);
  }

  const safeName = fileObj.name.replace(/\s+/g, "_");
  const storagePath = `driver-files/${driverId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, fileObj.rawFile);
  const downloadURL = await getDownloadURL(storageRef);

  return sanitizeFileForDb({
    ...fileObj,
    url: downloadURL,
    data: downloadURL,
    storagePath,
  });
}

export const useDriversStore = create((set, get) => ({
  drivers: [],
  idCounter: 20,
  isLoading: true,
  syncError: null,
  unsubscribeDrivers: null,

  initDrivers: async () => {
    if (get().unsubscribeDrivers) return;

    set({ isLoading: true, syncError: null });

    if (!isFirebaseConfigured || !db) {
      set({
        drivers: SAMPLE_DRIVERS,
        idCounter: Math.max(...SAMPLE_DRIVERS.map((driver) => driver.id), 20),
        isLoading: false,
        syncError: "Firebase env is not configured. Showing local sample data.",
      });
      return;
    }

    try {
      await ensureAuthReady();
      await preflightFirestoreRead();
    } catch (error) {
      set({
        isLoading: false,
        syncError: error.message || "Firebase auth/database check failed.",
      });
      return;
    }

    let hasSeedAttempted = false;
    let isResolved = false;

    const loadingTimeout = window.setTimeout(() => {
      if (isResolved) return;
      set({
        isLoading: false,
        syncError:
          "Firebase sync timeout. Check Firestore rules, Authentication provider, and network.",
      });
    }, 12000);

    const unsubscribe = onSnapshot(
      collection(db, "drivers"),
      async (snapshot) => {
        try {
          if (snapshot.empty && !hasSeedAttempted) {
            hasSeedAttempted = true;
            await seedSampleDrivers();
            return;
          }

          const drivers = snapshot.docs
            .map((snap) => ensureDriverShape(snap.data()))
            .sort((a, b) => Number(b.id) - Number(a.id));

          const idCounter = drivers.length
            ? Math.max(...drivers.map((driver) => Number(driver.id) || 0), 20)
            : 20;

          isResolved = true;
          window.clearTimeout(loadingTimeout);

          set({
            drivers,
            idCounter,
            isLoading: false,
            syncError: null,
          });
        } catch (error) {
          isResolved = true;
          window.clearTimeout(loadingTimeout);
          set({
            isLoading: false,
            syncError: error.message || "Failed while processing Firebase snapshot.",
          });
        }
      },
      (error) => {
        isResolved = true;
        window.clearTimeout(loadingTimeout);
        set({ isLoading: false, syncError: error.message || "Failed to sync drivers." });
      },
    );

    set({ unsubscribeDrivers: unsubscribe });
  },

  stopDriversSync: () => {
    const unsubscribe = get().unsubscribeDrivers;
    if (unsubscribe) unsubscribe();
    set({ unsubscribeDrivers: null });
  },

  upd: async (id, patch) => {
    const safePatch = stripUndefined(patch);

    set((state) => ({
      drivers: state.drivers.map((driver) => (driver.id === id ? { ...driver, ...safePatch } : driver)),
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      await updateDoc(doc(db, "drivers", String(id)), safePatch);
    } catch (error) {
      set({ syncError: error.message || "Failed to update driver." });
    }
  },

  addNote: async (id, text) => {
    const entry = {
      text,
      date: new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    let nextNotes = [];
    const lastContact = todayStr();

    set((state) => ({
      drivers: state.drivers.map((driver) =>
        driver.id === id
          ? (() => {
              nextNotes = [entry, ...(driver.notes || [])];
              return { ...driver, notes: nextNotes, lastContact };
            })()
          : driver,
      ),
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      await updateDoc(doc(db, "drivers", String(id)), {
        notes: nextNotes,
        lastContact,
      });
    } catch (error) {
      set({ syncError: error.message || "Failed to save note." });
    }
  },

  addFile: async (id, fileObj) => {
    let savedFile = sanitizeFileForDb(fileObj);

    try {
      if (isFirebaseConfigured && db) {
        savedFile = await uploadDriverFile(id, fileObj);
      }
    } catch (error) {
      set({ syncError: error.message || "Failed to upload file." });
      return;
    }

    let nextFiles = [];
    set((state) => ({
      drivers: state.drivers.map((driver) =>
        driver.id === id
          ? (() => {
              nextFiles = [...(driver.files || []), savedFile];
              return { ...driver, files: nextFiles };
            })()
          : driver,
      ),
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      await updateDoc(doc(db, "drivers", String(id)), { files: nextFiles });
    } catch (error) {
      set({ syncError: error.message || "Failed to save file metadata." });
    }
  },

  addDriver: async (data) => {
    const nextId = get().idCounter + 1;
    const newDriver = ensureDriverShape({
      id: nextId,
      ...data,
    });

    set((state) => ({
      idCounter: nextId,
      drivers: [newDriver, ...state.drivers],
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      await setDoc(doc(db, "drivers", String(nextId)), stripUndefined(newDriver));
    } catch (error) {
      set({ syncError: error.message || "Failed to create driver." });
    }
  },

  deleteDriverFileFromStorage: async (fileObj) => {
    if (!storage || !fileObj?.storagePath) return;
    try {
      await deleteObject(ref(storage, fileObj.storagePath));
    } catch {
      // Ignore storage cleanup errors. Metadata is source of truth.
    }
  },
}));
