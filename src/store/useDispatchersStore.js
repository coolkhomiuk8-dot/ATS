import { create } from "zustand";
import { auth, db, ensureAuthReady, isFirebaseConfigured } from "../lib/firebase";
import {
  collection, deleteDoc, doc,
  onSnapshot, query, setDoc, updateDoc,
} from "firebase/firestore";

function ensureShape(d) {
  return {
    id: d.id || String(Date.now()),
    name: d.name || "",
    telegram: d.telegram || "",
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

  subscribe() {
    if (!isFirebaseConfigured || !auth?.currentUser) return;
    const unsub = onSnapshot(query(colRef()), (snap) => {
      const dispatchers = snap.docs.map((d) => ensureShape({ id: d.id, ...d.data() }));
      set({ dispatchers, loaded: true });
    });
    set({ unsub });
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
    set((s) => ({
      dispatchers: s.dispatchers.map((d) => d.id === id ? { ...d, ...patch } : d),
    }));
    await updateDoc(doc(colRef(), id), patch);
  },

  async remove(id) {
    await ensureAuthReady();
    set((s) => ({ dispatchers: s.dispatchers.filter((d) => d.id !== id) }));
    await deleteDoc(doc(colRef(), id));
  },
}));
