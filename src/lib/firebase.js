import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredConfigKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "messagingSenderId",
  "appId",
];

export const isFirebaseConfigured = requiredConfigKeys.every((key) => Boolean(firebaseConfig[key]));

let app = null;
let db = null;
let auth = null;
let ensureAuthReady = async () => {};

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);

  // Two hardening flags for hostile client environments:
  //
  //   experimentalAutoDetectLongPolling — probes the network on init and
  //   falls back to plain HTTPS long-polling whenever WebChannel (the
  //   default persistent stream) gets severed. Corporate firewalls / proxies
  //   love killing idle streams after the first message.
  //
  //   localCache: memoryLocalCache() — disables IndexedDB persistence and
  //   uses in-memory only. Recruiter's browser was showing a pattern where
  //   N writes succeeded then subsequent ones hung forever, which matches a
  //   corrupted or quota-full IndexedDB store. Memory cache eliminates that
  //   entire failure mode; the only downside is losing pending writes on
  //   full-page reload, which for a CRM is completely fine.
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    localCache: memoryLocalCache(),
  });

  auth = getAuth(app);

  // Cheap in-memory throttle so we don't force-refresh on every single
  // Firestore write — Firebase caches the id-token internally too, but
  // proactively pinging it every ~5 min prevents the "SDK silently hangs
  // forever because a stale token failed to refresh" failure mode.
  let lastTokenCheck = 0;
  const TOKEN_CHECK_MS = 5 * 60 * 1000;

  ensureAuthReady = async () => {
    if (!auth.currentUser) {
      throw new Error("Not authenticated in Firebase. Sign in with Email/Password or Google.");
    }
    const now = Date.now();
    if (now - lastTokenCheck < TOKEN_CHECK_MS) return;
    lastTokenCheck = now;
    try {
      // getIdToken(true) forces a network refresh against Google's token
      // endpoint. If the refresh fails (revoked session, network partition),
      // we throw here — much better than a silent updateDoc hang later.
      await auth.currentUser.getIdToken(true);
    } catch (err) {
      throw new Error(
        `Не вдалось оновити токен авторизації (${err?.code || "unknown"}). ` +
        `Спробуй Log out → Log in.`
      );
    }
  };
} else {
  // eslint-disable-next-line no-console
  console.warn("Firebase config is incomplete. Fill .env values to enable cloud sync.");
}

export { app, auth, db, ensureAuthReady };
