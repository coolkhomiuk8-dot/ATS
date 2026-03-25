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

  ensureAuthReady = async () => {
    if (!auth.currentUser) {
      throw new Error("Not authenticated in Firebase. Sign in with Email/Password or Google.");
    }
  };
} else {
  // eslint-disable-next-line no-console
  console.warn("Firebase config is incomplete. Fill .env values to enable cloud sync.");
}

export { app, auth, db, ensureAuthReady };
