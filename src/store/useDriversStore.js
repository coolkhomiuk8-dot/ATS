import { create } from "zustand";
import { todayStr } from "../utils/date";
import { db, ensureAuthReady, isFirebaseConfigured, storage } from "../lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
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

function getDriverDocId(driver) {
  return String(driver?.docId || driver?.id || "");
}

function normalizeDriverKeyPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildDriverFileDocId(name, phone) {
  const tokens = String(name || "")
    .trim()
    .split(/\s+/)
    .map(normalizeDriverKeyPart)
    .filter(Boolean);

  const first = tokens[0] || "driver";
  const second = tokens[1] || "unknown";
  const phonePart = String(phone || "").replace(/\D/g, "") || "0000000000";

  return `${first}_${second}_${phonePart}`;
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
        drivers: [],
        idCounter: 20,
        isLoading: false,
        syncError: "Firebase env is not configured.",
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
      (snapshot) => {
        try {
          const drivers = snapshot.docs
            .map((snap) =>
              ensureDriverShape({
                ...snap.data(),
                docId: snap.id,
              }),
            )
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
      const current = get().drivers.find((driver) => driver.id === id);
      const docId = getDriverDocId(current || { id });
      await updateDoc(doc(db, "drivers", docId), safePatch);
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
      const current = get().drivers.find((driver) => driver.id === id);
      const docId = getDriverDocId(current || { id });
      await updateDoc(doc(db, "drivers", docId), {
        notes: nextNotes,
        lastContact,
      });
    } catch (error) {
      set({ syncError: error.message || "Failed to save note." });
    }
  },

  addFile: async (id, fileObj) => {
    const currentDriver = get().drivers.find((driver) => driver.id === id);
    if (!currentDriver) return;

    let resolvedDocId = getDriverDocId(currentDriver);
    const targetDocId = buildDriverFileDocId(currentDriver.name, currentDriver.phone);

    let savedFile = sanitizeFileForDb(fileObj);

    try {
      if (isFirebaseConfigured && db) {
        await ensureAuthReady();

        if (resolvedDocId !== targetDocId) {
          const targetRef = doc(db, "drivers", targetDocId);
          const targetSnap = await getDoc(targetRef);

          if (targetSnap.exists() && Number(targetSnap.data()?.id) !== Number(currentDriver.id)) {
            throw new Error("Another driver already uses this name_surname_phonenumber key.");
          }

          await setDoc(
            targetRef,
            stripUndefined({
              ...currentDriver,
              docId: targetDocId,
            }),
            { merge: true },
          );

          if (resolvedDocId && resolvedDocId !== targetDocId) {
            await deleteDoc(doc(db, "drivers", resolvedDocId));
          }

          resolvedDocId = targetDocId;
        }

        savedFile = await uploadDriverFile(resolvedDocId, fileObj);
      }
    } catch (error) {
      const message = String(error?.message || "");
      const isStorageUnauthorized =
        message.includes("storage/unauthorized") ||
        message.includes("does not have permission to access");

      set({
        syncError: isStorageUnauthorized
          ? "Upload blocked by Firebase Storage rules. Grant write access to role admin/root for path driver-files/{driverKey}/{fileName}."
          : error.message || "Failed to upload file.",
      });
      return;
    }

    let nextFiles = [];
    set((state) => ({
      drivers: state.drivers.map((driver) =>
        driver.id === id
          ? (() => {
              nextFiles = [...(driver.files || []), savedFile];
              return { ...driver, docId: resolvedDocId, files: nextFiles };
            })()
          : driver,
      ),
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      await updateDoc(doc(db, "drivers", resolvedDocId), {
        files: nextFiles,
        docId: resolvedDocId,
      });
    } catch (error) {
      set({ syncError: error.message || "Failed to save file metadata." });
    }
  },

  removeFile: async (id, fileIdx) => {
    const currentDriver = get().drivers.find((driver) => driver.id === id);
    if (!currentDriver) return;

    const currentFiles = currentDriver.files || [];
    const fileToDelete = currentFiles[fileIdx];
    if (!fileToDelete) return;

    const nextFiles = currentFiles.filter((_, idx) => idx !== fileIdx);
    const nextDocs = { ...(currentDriver.docs || {}) };

    if (fileToDelete?.linkedDoc) {
      const stillLinked = nextFiles.some((item) => item.linkedDoc === fileToDelete.linkedDoc);
      if (!stillLinked) nextDocs[fileToDelete.linkedDoc] = false;
    }

    set((state) => ({
      drivers: state.drivers.map((driver) =>
        driver.id === id
          ? { ...driver, files: nextFiles, docs: nextDocs }
          : driver,
      ),
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      const current = get().drivers.find((driver) => driver.id === id) || currentDriver;
      const docId = getDriverDocId(current || { id });
      await updateDoc(doc(db, "drivers", docId), {
        files: nextFiles,
        docs: nextDocs,
      });
    } catch (error) {
      set({ syncError: error.message || "Failed to remove file from driver." });
      return;
    }

    if (!storage || !fileToDelete.storagePath) return;

    try {
      await deleteObject(ref(storage, fileToDelete.storagePath));
    } catch (error) {
      set({
        syncError:
          error?.message || "File metadata removed, but failed to delete physical file from Storage.",
      });
    }
  },

  addDriver: async (data) => {
    const nextId = get().idCounter + 1;
    const newDriver = ensureDriverShape({
      id: nextId,
      docId: String(nextId),
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

}));
