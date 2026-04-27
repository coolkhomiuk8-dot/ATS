import { google } from "googleapis";

function getDriveServiceAccount() {
  // Prefer individual fields (avoids 4 KB Lambda env-var limit, matches _auth.js)
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (projectId && privateKey && clientEmail) {
    return {
      type: "service_account",
      project_id: projectId,
      private_key: privateKey.replace(/\\n/g, "\n"),
      client_email: clientEmail,
    };
  }

  // Fallback: full JSON blob
  const raw =
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "Missing Google Drive credentials. Set FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL, or GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON."
    );
  }
  return JSON.parse(raw);
}

function getDriveRootFolderName() {
  const value = String(process.env.GOOGLE_DRIVE_ROOT_FOLDER_NAME || "").trim();
  if (!value) {
    throw new Error("Missing GOOGLE_DRIVE_ROOT_FOLDER_NAME environment variable.");
  }
  return value;
}

function getExplicitRootFolderId() {
  const value = String(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim();
  if (!value) {
    throw new Error("Missing GOOGLE_DRIVE_ROOT_FOLDER_ID environment variable.");
  }
  return value;
}

function isFolder(file) {
  return file?.mimeType === "application/vnd.google-apps.folder";
}

export function normalizeFolderPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function getDriveClient() {
  const creds = getDriveServiceAccount();

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

async function findChildFolder(drive, parentId, name) {
  const escapedName = name.replace(/'/g, "\\'");
  const q = [
    `name = '${escapedName}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    `'${parentId}' in parents`,
    "trashed = false",
  ].join(" and ");

  const result = await drive.files.list({
    q,
    fields: "files(id,name,mimeType)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return result.data.files?.find(isFolder) || null;
}

async function createFolder(drive, parentId, name) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });

  return res.data;
}

export async function ensureRootFolder(drive) {
  const explicitRootFolderId = getExplicitRootFolderId();
  const rootName = getDriveRootFolderName();

  try {
    const res = await drive.files.get({
      fileId: explicitRootFolderId,
      fields: "id,name,mimeType,driveId",
      supportsAllDrives: true,
    });

    if (res?.data?.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID must point to a Google Drive folder.");
    }

    if (res?.data?.name && res.data.name !== rootName) {
      const err = new Error(
        `GOOGLE_DRIVE_ROOT_FOLDER_NAME mismatch: expected \"${rootName}\", got \"${res.data.name}\" for GOOGLE_DRIVE_ROOT_FOLDER_ID.`
      );
      err.statusCode = 400;
      throw err;
    }

    return explicitRootFolderId;
  } catch (error) {
    const details = String(
      error?.message || error?.response?.data?.error?.message || "unknown error"
    );
    const err = new Error(
      "Invalid GOOGLE_DRIVE_ROOT_FOLDER_ID or no access for service account. Share that folder (or Shared Drive) with the service-account email and use the folder ID from its URL. Details: " +
        details
    );
    err.statusCode = 400;
    throw err;
  }
}

export async function ensureDriverFolder(drive, driverKey) {
  const safeKey = normalizeFolderPart(driverKey) || "driver_unknown_0000000000";
  const rootId = await ensureRootFolder(drive);

  const existing = await findChildFolder(drive, rootId, safeKey);
  if (existing?.id) return { folderId: existing.id, folderName: safeKey };

  const created = await createFolder(drive, rootId, safeKey);
  return { folderId: created.id, folderName: safeKey };
}

export async function ensureTruckFolder(drive, truckKey) {
  const safeKey = normalizeFolderPart(`truck_unit_${truckKey}`) || "truck_unknown";
  const rootId = await ensureRootFolder(drive);

  const existing = await findChildFolder(drive, rootId, safeKey);
  if (existing?.id) return { folderId: existing.id, folderName: safeKey };

  const created = await createFolder(drive, rootId, safeKey);
  return { folderId: created.id, folderName: safeKey };
}

export async function makeFilePublicReadable(drive, fileId) {
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
    supportsAllDrives: true,
  });
}
