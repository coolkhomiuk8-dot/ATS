import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
  db = getFirestore(app);
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
