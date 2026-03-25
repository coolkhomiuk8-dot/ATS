import { ensureDriverFolder, getDriveClient } from "./_drive.js";
import { requireAdminOrRoot } from "./_auth.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function isDebugEnabled() {
  return String(process.env.DEBUG_DRIVE_DELETE || "").trim().toLowerCase() === "true";
}

function isDriveNotFound(error) {
  const code = Number(error?.code || error?.status || error?.response?.status || 0);
  const message = String(error?.message || error?.response?.data?.error?.message || "").toLowerCase();
  return code === 404 || message.includes("file not found");
}

async function deleteByIdIfExists(drive, fileId) {
  try {
    await drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });
    return true;
  } catch (error) {
    // In Shared Drives, some roles cannot hard-delete, and API may return 404/403.
    // Fallback to moving file to trash so it disappears from active lists.
    try {
      const updated = await drive.files.update({
        fileId,
        requestBody: { trashed: true },
        fields: "id,trashed",
        supportsAllDrives: true,
      });

      if (updated?.data?.trashed === true) return true;
    } catch (trashError) {
      if (isDriveNotFound(trashError)) return false;
      const status = Number(trashError?.code || trashError?.status || trashError?.response?.status || 0);
      if (status === 403) {
        const err = new Error(
          "Google Drive permission denied for delete/trash. Grant service account Content manager (or Manager) role in Shared Drive."
        );
        err.statusCode = 403;
        throw err;
      }
      throw trashError;
    }

    if (isDriveNotFound(error)) return false;
    const status = Number(error?.code || error?.status || error?.response?.status || 0);
    if (status === 403) {
      const err = new Error(
        "Google Drive permission denied for delete. Grant service account Content manager (or Manager) role in Shared Drive."
      );
      err.statusCode = 403;
      throw err;
    }
    throw error;
  }
}

async function findFilesByNameInFolder(drive, folderId, fileName) {
  const escapedName = String(fileName || "").replace(/'/g, "\\'");
  const q = [
    `'${folderId}' in parents`,
    `name = '${escapedName}'`,
    "trashed = false",
  ].join(" and ");

  const result = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 20,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return result.data.files || [];
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    await requireAdminOrRoot(event.headers.authorization || event.headers.Authorization);

    const payload = JSON.parse(event.body || "{}");
    const fileId = String(payload.fileId || "").trim();
    const driverId = String(payload.driverId || "").trim();
    const fileName = String(payload.fileName || "").trim();
    const folderId = String(payload.folderId || "").trim();
    const debugEnabled = isDebugEnabled();

    if (!fileId && !(driverId && fileName)) {
      return json(400, { error: "fileId is required, or pass driverId + fileName for fallback deletion." });
    }

    const drive = await getDriveClient();
    let deletedCount = 0;
    let resolvedFolderId = folderId || "";
    let folderMatchesCount = 0;

    if (fileId) {
      const deleted = await deleteByIdIfExists(drive, fileId);
      if (deleted) deletedCount += 1;
    }

    if (deletedCount === 0 && fileName) {
      let targetFolderId = folderId;
      if (!targetFolderId && driverId) {
        const folder = await ensureDriverFolder(drive, driverId);
        targetFolderId = folder.folderId;
      }
      resolvedFolderId = targetFolderId || "";

      const matches = targetFolderId
        ? await findFilesByNameInFolder(drive, targetFolderId, fileName)
        : [];
      folderMatchesCount = matches.length;

      for (const file of matches) {
        const deleted = await deleteByIdIfExists(drive, file.id);
        if (deleted) deletedCount += 1;
      }

      // Intentionally do not search globally across Drive.
      // Deletions are constrained to the resolved driver folder only.
    }

    if (deletedCount === 0) {
      return json(404, debugEnabled ? {
        error: "File was not found in Google Drive. Nothing was deleted.",
        debug: {
          fileId,
          driverId,
          fileName,
          folderIdFromPayload: folderId,
          resolvedFolderId,
          folderMatchesCount,
        },
      } : {
        error: "File was not found in Google Drive. Nothing was deleted.",
      });
    }

    return json(200, debugEnabled ? {
      ok: true,
      fileId,
      deletedCount,
      debug: {
        driverId,
        fileName,
        folderIdFromPayload: folderId,
        resolvedFolderId,
        folderMatchesCount,
      },
    } : { ok: true, fileId, deletedCount });
  } catch (error) {
    const statusCode = error.statusCode || error.code || error.status || error?.response?.status || 500;
    return json(statusCode, {
      error: error.message || "Failed to delete file from Google Drive.",
    });
  }
};
