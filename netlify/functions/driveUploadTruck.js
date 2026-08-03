import Busboy from "busboy";
import { Readable } from "node:stream";
import { getDriveClient, ensureTruckFolder, ensureFolderInParent, makeFilePublicReadable } from "./_drive.js";
import { requireAdminOrRoot } from "./_auth.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      reject(new Error("Expected multipart/form-data payload."));
      return;
    }

    const fields = {};
    let fileMeta = null;
    const bb = Busboy({ headers: { "content-type": contentType } });

    bb.on("field", (name, value) => { fields[name] = value; });
    bb.on("file", (name, file, info) => {
      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        fileMeta = {
          fieldName: name,
          filename: info.filename || "upload.bin",
          mimeType: info.mimeType || "application/octet-stream",
          buffer: Buffer.concat(chunks),
        };
      });
    });
    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, file: fileMeta }));

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "");
    Readable.from(bodyBuffer).pipe(bb);
  });
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    await requireAdminOrRoot(event.headers.authorization || event.headers.Authorization);

    const { fields, file } = await parseMultipart(event);
    const truckId    = String(fields.truckId    || "").trim();
    const unitNumber = String(fields.unitNumber || "").trim() || truckId;
    const subFolder  = String(fields.subFolder  || "").trim(); // e.g. "Oil Change"

    if (!truckId) return json(400, { error: "truckId is required." });
    if (!file || !file.buffer || file.buffer.length === 0) return json(400, { error: "file is required." });

    const drive = await getDriveClient();
    // Always use unitNumber for folder naming (truck_unit_101, etc.)
    const { folderId, folderName } = await ensureTruckFolder(drive, unitNumber);

    // If a sub-folder is requested (e.g. "Oil Change"), nest the file inside it
    const targetFolderId = subFolder
      ? await ensureFolderInParent(drive, folderId, subFolder)
      : folderId;

    const created = await drive.files.create({
      requestBody: { name: file.filename, parents: [targetFolderId] },
      media: { mimeType: file.mimeType, body: Readable.from(file.buffer) },
      fields: "id,name,webViewLink,webContentLink,mimeType,size",
      supportsAllDrives: true,
    });

    const fileId = created.data.id;
    await makeFilePublicReadable(drive, fileId);

    const fresh = await drive.files.get({
      fileId,
      fields: "id,name,webViewLink,webContentLink,mimeType,size",
      supportsAllDrives: true,
    });

    return json(200, {
      id: fresh.data.id,
      fileId: fresh.data.id,
      name: fresh.data.name,
      webViewLink: fresh.data.webViewLink,
      webContentLink: fresh.data.webContentLink,
      mimeType: fresh.data.mimeType,
      size: Number(fresh.data.size || file.buffer.length),
      folderId,
      folderName,
    });
  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message || "Failed to upload file to Google Drive.",
    });
  }
};
