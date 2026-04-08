import admin from "firebase-admin";

let initialized = false;

function getServiceAccount() {
  // Prefer individual fields (avoids 4KB Lambda env-var limit)
  const projectId  = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (projectId && privateKey && clientEmail) {
    return {
      projectId,
      privateKey: privateKey.replace(/\\n/g, "\n"), // handle escaped newlines
      clientEmail,
    };
  }

  // Fallback: full JSON (legacy)
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "Missing Firebase credentials. Set FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL."
    );
  }
  return JSON.parse(raw);
}

export function getDb() {
  if (!initialized) {
    admin.initializeApp({
      credential: admin.credential.cert(getServiceAccount()),
    });
    initialized = true;
  }

  return admin.firestore();
}

function normalizeRole(value) {
  return String(value || "user").trim().toLowerCase();
}

export async function requireAdminOrRoot(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const err = new Error("Missing Authorization Bearer token.");
    err.statusCode = 401;
    throw err;
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    const err = new Error("Empty Firebase ID token.");
    err.statusCode = 401;
    throw err;
  }

  const db = getDb();
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    const err = new Error(
      "Invalid Firebase ID token for this project. Ensure FIREBASE_SERVICE_ACCOUNT_JSON matches VITE_FIREBASE_PROJECT_ID and sign in again."
    );
    err.statusCode = 401;
    throw err;
  }
  const email = String(decoded.email || "").trim().toLowerCase();
  if (!email) {
    const err = new Error("Authenticated user does not have email.");
    err.statusCode = 403;
    throw err;
  }

  const roleSnap = await db.collection("user_roles").doc(email).get();
  const role = normalizeRole(roleSnap.exists ? roleSnap.data()?.role : "user");

  if (!["admin", "root"].includes(role)) {
    const err = new Error("Only admin/root can manage files.");
    err.statusCode = 403;
    throw err;
  }

  return { email, role, decoded };
}
