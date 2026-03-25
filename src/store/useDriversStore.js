import { create } from "zustand";
import { todayStr } from "../utils/date";
import { auth, db, ensureAuthReady, isFirebaseConfigured } from "../lib/firebase";
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

const driveUploadEndpoint = import.meta.env.VITE_DRIVE_UPLOAD_ENDPOINT || "/.netlify/functions/driveUpload";
const driveDeleteEndpoint = import.meta.env.VITE_DRIVE_DELETE_ENDPOINT || "/.netlify/functions/driveDelete";

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
    createdAt: null,
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
  const tokens = normalizeDriverKeyPart(name).split("_").filter(Boolean);

  const first = tokens[0] || "driver";
  const second = tokens[1] || tokens[0] || "driver";
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
  if (!fileObj.rawFile) {
    return sanitizeFileForDb(fileObj);
  }

  if (!driveUploadEndpoint) {
    throw new Error("Google Drive upload endpoint is not configured. Set VITE_DRIVE_UPLOAD_ENDPOINT.");
  }

  if (!auth?.currentUser) {
    throw new Error("Not authenticated in Firebase. Sign in again.");
  }

  const idToken = await auth.currentUser.getIdToken();
  const formData = new FormData();
  formData.append("file", fileObj.rawFile, fileObj.name);
  formData.append("driverId", String(driverId));

  const response = await fetch(driveUploadEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Google Drive upload failed (${response.status}).`);
  }

  const payload = await response.json().catch(() => ({}));
  const viewUrl = payload.webViewLink || payload.url || "";
  const contentUrl = payload.webContentLink || "";
  const driveUrl = fileObj.type === "image" ? contentUrl || viewUrl : viewUrl || contentUrl;

  if (!driveUrl) {
    throw new Error("Drive upload succeeded, but response did not include a file URL.");
  }

  return sanitizeFileForDb({
    ...fileObj,
    url: driveUrl,
    data: driveUrl,
    viewUrl,
    contentUrl,
    driveFileId: payload.id || payload.fileId || null,
  });
}

async function deleteDriverFileFromDrive(fileObj) {
  if (!fileObj?.driveFileId) return;

  if (!driveDeleteEndpoint) {
    throw new Error("Google Drive delete endpoint is not configured. Set VITE_DRIVE_DELETE_ENDPOINT.");
  }

  if (!auth?.currentUser) {
    throw new Error("Not authenticated in Firebase. Sign in again.");
  }

  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(driveDeleteEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fileId: fileObj.driveFileId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Google Drive delete failed (${response.status}).`);
  }
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
      set({
        syncError: error.message || "Failed to upload file to Google Drive.",
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

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      await deleteDriverFileFromDrive(fileToDelete);

      const current = get().drivers.find((driver) => driver.id === id) || currentDriver;
      const docId = getDriverDocId(current || { id });
      await updateDoc(doc(db, "drivers", docId), {
        files: nextFiles,
        docs: nextDocs,
      });

      set((state) => ({
        drivers: state.drivers.map((driver) =>
          driver.id === id
            ? { ...driver, files: nextFiles, docs: nextDocs }
            : driver,
        ),
      }));
    } catch (error) {
      set({ syncError: error.message || "Failed to remove file from Google Drive." });
    }
  },

  addDriver: async (data) => {
    const nextId = get().idCounter + 1;
    const newDriver = ensureDriverShape({
      id: nextId,
      docId: String(nextId),
      createdAt: todayStr(),
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
