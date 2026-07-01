import { create } from "zustand";
import { todayStr } from "../utils/date";
import { auth, db, ensureAuthReady, isFirebaseConfigured } from "../lib/firebase";
import {
  arrayRemove,
  arrayUnion,
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
  const files = Array.isArray(driver?.files)
    ? driver.files.map((file) => {
        const directId = String(file?.driveFileId || "").trim();
        const urlCandidates = [file?.viewUrl, file?.contentUrl, file?.url, file?.data]
          .map((value) => String(value || ""))
          .filter(Boolean);

        let derivedId = "";
        for (const candidate of urlCandidates) {
          const byPath = candidate.match(/\/d\/([^/]+)/);
          if (byPath?.[1]) {
            derivedId = byPath[1];
            break;
          }

          const byQuery = candidate.match(/[?&]id=([^&]+)/);
          if (byQuery?.[1]) {
            derivedId = byQuery[1];
            break;
          }
        }

        return {
          ...file,
          driveFileId: directId || derivedId || null,
        };
      })
    : [];

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
    files,
    docs: {},
    flags: [],
    interest: "Warm",
    lastContact: null,
    createdAt: null,
    qualifications: [],
    stageHistory: [],
    dlExpiry: "",
    hireDate: "",
    emptyMilesRate: 0,
    loadedMilesRate: 0,
    enabled: true,
    citizen: null,       // true | false | null
    militaryLoads: null, // "yes" | "no" | "not_sure" | null
    emergencyContacts: [], // [{ name, phone }]
    truckHistory: [],      // [{ truckId, unitNumber, from, to }]
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
  const fullNamePart = normalizeDriverKeyPart(name) || "driver";
  const phonePart = String(phone || "").replace(/\D/g, "") || "0000000000";

  return `${fullNamePart}_${phonePart}`;
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

async function uploadDriverFile(driverId, driverName, fileObj) {
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
  formData.append("driverName", String(driverName || ""));

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
    folderId: payload.folderId || null,
    folderName: payload.folderName || null,
  });
}

async function deleteDriverFileFromDrive(fileObj, driverDocId) {
  const directId = String(fileObj?.driveFileId || "").trim();
  const urlCandidates = [fileObj?.viewUrl, fileObj?.contentUrl, fileObj?.url, fileObj?.data]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  let derivedId = "";
  for (const candidate of urlCandidates) {
    const byPath = candidate.match(/\/d\/([^/]+)/);
    if (byPath?.[1]) {
      derivedId = byPath[1];
      break;
    }

    const byQuery = candidate.match(/[?&]id=([^&]+)/);
    if (byQuery?.[1]) {
      derivedId = byQuery[1];
      break;
    }
  }

  const fileId = directId || derivedId;

  if (!fileId && !(driverDocId && fileObj?.name)) {
    throw new Error("Cannot delete from Google Drive: missing fileId and fallback metadata.");
  }

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
    body: JSON.stringify({
      fileId,
      driverId: String(driverDocId || ""),
      fileName: String(fileObj?.name || ""),
      folderId: String(fileObj?.folderId || ""),
    }),
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

    // Stage change: build a stageHistory entry, but DON'T write the full
    // array — Firestore would then overwrite a concurrent edit by the other
    // user. Instead use arrayUnion below to atomically append.
    let stageHistoryEntry = null;
    if (safePatch.stage) {
      const current = get().drivers.find((d) => d.id === id);
      if (current && current.stage !== safePatch.stage) {
        stageHistoryEntry = { stage: safePatch.stage, date: todayStr(), ts: Date.now() };
      }
    }

    // Optimistic local update — the entry is shown immediately. Whole-array
    // shape is fine in local state because Zustand is single-tab; the
    // concurrency issue is only on the Firestore side.
    set((state) => ({
      drivers: state.drivers.map((driver) => {
        if (driver.id !== id) return driver;
        const next = { ...driver, ...safePatch };
        if (stageHistoryEntry) {
          next.stageHistory = [...(driver.stageHistory || []), stageHistoryEntry];
        }
        return next;
      }),
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      const current = get().drivers.find((driver) => driver.id === id);
      const docId = getDriverDocId(current || { id });

      // Build the Firestore patch: scalars from safePatch, plus arrayUnion
      // for stageHistory if we have an entry. arrayUnion is atomic on the
      // server — concurrent writes from two tabs merge instead of overwriting.
      const fsPatch = { ...safePatch };
      if (stageHistoryEntry) fsPatch.stageHistory = arrayUnion(stageHistoryEntry);
      await updateDoc(doc(db, "drivers", docId), fsPatch);
    } catch (error) {
      set({ syncError: error.message || "Failed to update driver." });
    }
  },

  /**
   * Toggle one docs-checklist entry (DL / Passport / SSN / …) atomically.
   * Uses a Firestore dotted-path update so we only touch that one nested key,
   * not the whole `docs` map — concurrent toggles on different keys from two
   * tabs both survive.
   */
  toggleDoc: async (id, docKey) => {
    const driver = get().drivers.find((d) => d.id === id);
    if (!driver) return;
    const next = !driver.docs?.[docKey];

    set((state) => ({
      drivers: state.drivers.map((d) =>
        d.id === id ? { ...d, docs: { ...(d.docs || {}), [docKey]: next } } : d,
      ),
    }));

    if (!isFirebaseConfigured || !db) return;
    try {
      await ensureAuthReady();
      const currentDriver = get().drivers.find((d) => d.id === id);
      const docId = getDriverDocId(currentDriver || { id });
      await updateDoc(doc(db, "drivers", docId), { [`docs.${docKey}`]: next });
    } catch (error) {
      set({ syncError: error.message || "Failed to update doc checklist." });
    }
  },

  /**
   * Set multiple docs-checklist entries atomically without touching sibling
   * keys. Used after a batch file upload that auto-checks the docs the files
   * were linked to.
   *
   * `updates` is a plain object like { DL: true, SSN: true, Passport: false }.
   * Each key is written via a dotted-path so concurrent edits from another
   * tab on OTHER doc keys survive.
   */
  setDocFlags: async (id, updates) => {
    const keys = Object.keys(updates || {});
    if (keys.length === 0) return;

    set((state) => ({
      drivers: state.drivers.map((d) =>
        d.id === id ? { ...d, docs: { ...(d.docs || {}), ...updates } } : d,
      ),
    }));

    if (!isFirebaseConfigured || !db) return;
    try {
      await ensureAuthReady();
      const current = get().drivers.find((d) => d.id === id);
      const docId = getDriverDocId(current || { id });
      const fsPatch = {};
      for (const k of keys) fsPatch[`docs.${k}`] = updates[k];
      await updateDoc(doc(db, "drivers", docId), fsPatch);
    } catch (error) {
      set({ syncError: error.message || "Failed to update docs." });
    }
  },

  /**
   * Toggle a flag on / off atomically via arrayUnion / arrayRemove.
   * Concurrent flag toggles from two tabs no longer overwrite each other.
   */
  toggleFlag: async (id, flag) => {
    const driver = get().drivers.find((d) => d.id === id);
    if (!driver) return;
    const currentFlags = Array.isArray(driver.flags) ? driver.flags : [];
    const isSet = currentFlags.includes(flag);
    const nextFlags = isSet ? currentFlags.filter((f) => f !== flag) : [...currentFlags, flag];

    set((state) => ({
      drivers: state.drivers.map((d) => (d.id === id ? { ...d, flags: nextFlags } : d)),
    }));

    if (!isFirebaseConfigured || !db) return;
    try {
      await ensureAuthReady();
      const current = get().drivers.find((d) => d.id === id);
      const docId = getDriverDocId(current || { id });
      await updateDoc(doc(db, "drivers", docId), {
        flags: isSet ? arrayRemove(flag) : arrayUnion(flag),
      });
    } catch (error) {
      set({ syncError: error.message || "Failed to toggle flag." });
    }
  },

  addNote: async (id, text) => {
    // `ts` makes the entry sortable on read — needed because we now write
    // notes with arrayUnion (which appends) instead of prepending. Older
    // entries without `ts` will land at the bottom on the next render.
    const entry = {
      text,
      ts: Date.now(),
      date: new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const lastContact = todayStr();

    // Optimistic: prepend locally so the user sees the new note immediately
    // at the top (same as before). The on-disk order will be append-only
    // (older→newer), and the UI sorts by `ts` desc so the rendered order
    // stays "newest first".
    set((state) => ({
      drivers: state.drivers.map((driver) =>
        driver.id === id
          ? { ...driver, notes: [entry, ...(driver.notes || [])], lastContact }
          : driver,
      ),
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      const current = get().drivers.find((driver) => driver.id === id);
      const docId = getDriverDocId(current || { id });
      await updateDoc(doc(db, "drivers", docId), {
        notes: arrayUnion(entry),
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
            throw new Error("Another driver already uses this fullname_phonenumber key.");
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

        savedFile = await uploadDriverFile(resolvedDocId, currentDriver.name, fileObj);
      }
    } catch (error) {
      set({
        syncError: error.message || "Failed to upload file to Google Drive.",
      });
      return;
    }

    // Optimistic append in local state
    set((state) => ({
      drivers: state.drivers.map((driver) =>
        driver.id === id
          ? { ...driver, docId: resolvedDocId, files: [...(driver.files || []), savedFile] }
          : driver,
      ),
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      // arrayUnion appends atomically — two simultaneous uploads from
      // different tabs both survive instead of overwriting each other.
      await updateDoc(doc(db, "drivers", resolvedDocId), {
        files: arrayUnion(savedFile),
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

    // Only touch the specific doc-key we're clearing; leave other keys alone
    // on the server so a concurrent toggle of a different doc from another
    // tab doesn't get wiped out.
    let docKeyToClear = null;
    if (fileToDelete?.linkedDoc) {
      const stillLinked = nextFiles.some((item) => item.linkedDoc === fileToDelete.linkedDoc);
      if (!stillLinked) {
        nextDocs[fileToDelete.linkedDoc] = false;
        docKeyToClear = fileToDelete.linkedDoc;
      }
    }

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      const current = get().drivers.find((driver) => driver.id === id) || currentDriver;
      const docId = getDriverDocId(current || { id });

      await deleteDriverFileFromDrive(fileToDelete, docId);

      // arrayRemove deletes by deep equality. fileToDelete came straight from
      // the local snapshot of Firestore data, so its shape matches the
      // server-stored entry exactly. Docs key (if any) is cleared via a
      // dotted-path so sibling checkboxes stay untouched.
      const fsPatch = { files: arrayRemove(fileToDelete) };
      if (docKeyToClear) fsPatch[`docs.${docKeyToClear}`] = false;
      await updateDoc(doc(db, "drivers", docId), fsPatch);

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

  deleteDriver: async (id) => {
    const current = get().drivers.find((d) => d.id === id);
    if (!current) return;

    set((state) => ({
      drivers: state.drivers.filter((d) => d.id !== id),
    }));

    if (!isFirebaseConfigured || !db) return;

    try {
      await ensureAuthReady();
      const docId = getDriverDocId(current);
      await deleteDoc(doc(db, "drivers", docId));
    } catch (error) {
      set({ syncError: error.message || "Failed to delete driver." });
    }
  },

  addDriver: async (data) => {
    const nextId = get().idCounter + 1;
    const createdAt = data.createdAt || todayStr();
    const initialStage = data.stage || "new";
    const existingHistory = Array.isArray(data.stageHistory) ? data.stageHistory : [];
    const newDriver = ensureDriverShape({
      id: nextId,
      docId: String(nextId),
      ...data,
      createdAt,
      stageHistory: existingHistory.length > 0
        ? existingHistory
        : [{ stage: initialStage, date: createdAt, ts: Date.now() }],
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
