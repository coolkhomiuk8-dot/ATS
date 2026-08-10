import { create } from "zustand";
import { auth, db, ensureAuthReady, isFirebaseConfigured } from "../lib/firebase";
import {
  collection, deleteDoc, doc,
  arrayUnion, onSnapshot, query, setDoc, updateDoc, where,
} from "firebase/firestore";
import { ACTIVE_STAGES } from "../constants/dispatcherData";

function ensureShape(d) {
  return {
    id: d.id || String(Date.now()),
    name: d.name || "",
    telegram: d.telegram || "",
    instagram: d.instagram || "",
    phone: d.phone || "",
    note: d.note || "",
    role: d.role || "",
    stage: d.stage || "new_lead",
    resumeUrl: d.resumeUrl || null,
    resumeName: d.resumeName || null,
    createdAt: d.createdAt || new Date().toISOString().slice(0, 10),
    ...d,
  };
}

function colRef() {
  return collection(db, "dispatchers");
}

export const useDispatchersStore = create((set, get) => ({
  dispatchers: [],
  loaded: false,
  unsub: null,
  // Which subscription is currently active — controls whether to re-subscribe
  // when the caller changes their mind (e.g. toggles "show archive").
  includeArchived: false,

  /**
   * Subscribe to the dispatchers collection.
   *
   * Default (`includeArchived: false`) applies a Firestore filter to skip
   * candidates in the terminal stages (rejected / hired). With 2000+ leads
   * accumulated, that filter reduces the read count roughly 10x, cuts the
   * initial payload, and eliminates the per-render work of buckets we don't
   * actually show.
   *
   * Call again with { includeArchived: true } to load everything. The old
   * listener is torn down before the new one attaches.
   */
  subscribe({ includeArchived = false } = {}) {
    if (!isFirebaseConfigured || !auth?.currentUser) return;

    // If already subscribed with the same mode, nothing to do.
    if (get().unsub && get().includeArchived === includeArchived) return;

    // Tear down any previous listener before replacing.
    get().unsub?.();

    // 'in' operator caps at 30 values — ACTIVE_STAGES is well under that.
    const q = includeArchived
      ? query(colRef())
      : query(colRef(), where("stage", "in", ACTIVE_STAGES));

    const unsub = onSnapshot(q, (snap) => {
      const dispatchers = snap.docs.map((d) => ensureShape({ id: d.id, ...d.data() }));
      set({ dispatchers, loaded: true });
    });
    set({ unsub, includeArchived });
  },

  unsubscribe() {
    get().unsub?.();
    set({ unsub: null, dispatchers: [], loaded: false });
  },

  async add(data) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dispatcher = ensureShape({ ...data, id });
    // optimistic update — show immediately in UI
    set((s) => ({ dispatchers: [...s.dispatchers, dispatcher] }));
    if (!isFirebaseConfigured || !auth?.currentUser) return;
    try {
      await setDoc(doc(colRef(), id), dispatcher);
    } catch (err) {
      console.error("Firestore add dispatcher failed:", err);
    }
  },

  async upd(id, patch) {
    await ensureAuthReady();
    const finalPatch = patch.stage !== undefined
      ? { ...patch, stageChangedAt: new Date().toISOString() }
      : patch;
    set((s) => ({
      dispatchers: s.dispatchers.map((d) => d.id === id ? { ...d, ...finalPatch } : d),
    }));
    await updateDoc(doc(colRef(), id), finalPatch);
  },

  /**
   * Append an entry to the `logs` array atomically — concurrent writes from
   * two recruiters on the same lead both survive instead of one overwriting
   * the other. Use this instead of upd({ logs: [...prev, entry] }).
   *
   * Extra optional patch can apply scalar updates in the same write
   * (e.g. lastContactAt). Local optimistic prepend keeps the new entry at
   * the top of the visible log even though Firestore appends.
   */
  async appendLog(id, entry, extraPatch = {}) {
    await ensureAuthReady();
    const stamped = { ts: Date.now(), ...entry };
    set((s) => ({
      dispatchers: s.dispatchers.map((d) =>
        d.id === id
          ? { ...d, ...extraPatch, logs: [...(d.logs || []), stamped] }
          : d,
      ),
    }));
    await updateDoc(doc(colRef(), id), {
      ...extraPatch,
      logs: arrayUnion(stamped),
    });
  },

  async remove(id) {
    await ensureAuthReady();
    set((s) => ({ dispatchers: s.dispatchers.filter((d) => d.id !== id) }));
    await deleteDoc(doc(colRef(), id));
  },
}));
