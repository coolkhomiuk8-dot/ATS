import {
  getDriveClient,
  ensureTruckFolder,
  ensureDriverFolder,
  ensureFolderInParent,
} from "./_drive.js";
import { requireAdminOrRoot, getDb } from "./_auth.js";

function json(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/**
 * Move a Drive file to a new folder.
 * Returns { moved: true } on success, { moved: false, reason } if skipped/failed.
 */
async function moveFile(drive, fileId, targetFolderId) {
  if (!fileId || !targetFolderId) return { moved: false, reason: "missing id" };
  try {
    const meta = await drive.files.get({
      fileId,
      fields: "id,parents",
      supportsAllDrives: true,
    });
    const parents = meta.data.parents || [];

    // Already in the right place — nothing to do
    if (parents.includes(targetFolderId)) return { moved: false, reason: "already_there" };

    await drive.files.update({
      fileId,
      addParents: targetFolderId,
      removeParents: parents.join(",") || undefined,
      supportsAllDrives: true,
      fields: "id,parents",
    });
    return { moved: true };
  } catch (err) {
    return { moved: false, reason: err.message };
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  try {
    await requireAdminOrRoot(
      event.headers.authorization || event.headers.Authorization
    );
  } catch (err) {
    return json(err.statusCode || 401, { error: err.message });
  }

  const drive = await getDriveClient();
  const db    = getDb();

  const report = {
    trucks:  { processed: 0, filesMoved: 0, skipped: 0, errors: [] },
    drivers: { processed: 0, filesMoved: 0, skipped: 0, errors: [] },
  };

  // ── TRUCKS ───────────────────────────────────────────────────────────────
  const trucksSnap = await db.collection("trucks").get();

  for (const docSnap of trucksSnap.docs) {
    const truck      = docSnap.data();
    const unitNumber = String(truck.unitNumber || "").trim();
    if (!unitNumber) continue;

    const files  = Array.isArray(truck.files)         ? truck.files         : [];
    const oilLog = Array.isArray(truck.oilChangeLog)   ? truck.oilChangeLog  : [];

    const hasAny = files.some((f) => f.driveFileId) || oilLog.some((e) => e.driveFileId);
    if (!hasAny) { report.trucks.skipped++; continue; }

    try {
      const { folderId: truckFolderId, folderName: truckFolderName } =
        await ensureTruckFolder(drive, unitNumber);

      // Cache the "Oil Change" sub-folder ID so we only call ensureFolderInParent once
      let oilSubFolderId = null;
      async function getOilFolder() {
        if (!oilSubFolderId)
          oilSubFolderId = await ensureFolderInParent(drive, truckFolderId, "Oil Change");
        return oilSubFolderId;
      }

      // Regular files
      const newFiles = [];
      for (const file of files) {
        if (!file.driveFileId) { newFiles.push(file); continue; }
        const isOilChange = file.linkedDoc === "Oil Change";
        const targetId    = isOilChange ? await getOilFolder() : truckFolderId;
        const { moved }   = await moveFile(drive, file.driveFileId, targetId);
        if (moved) {
          report.trucks.filesMoved++;
          newFiles.push({
            ...file,
            folderId:   targetId,
            folderName: isOilChange ? "Oil Change" : truckFolderName,
          });
        } else {
          newFiles.push(file);
        }
      }

      // Oil change log entries
      const newOilLog = [];
      for (const entry of oilLog) {
        if (!entry.driveFileId) { newOilLog.push(entry); continue; }
        const { moved } = await moveFile(drive, entry.driveFileId, await getOilFolder());
        if (moved) report.trucks.filesMoved++;
        newOilLog.push(entry); // folderId not stored in log entries — skip updating
      }

      await db.collection("trucks").doc(docSnap.id).update({
        files:        newFiles,
        oilChangeLog: newOilLog,
      });
      report.trucks.processed++;
    } catch (err) {
      report.trucks.errors.push(`Unit ${unitNumber}: ${err.message}`);
    }
  }

  // ── DRIVERS ──────────────────────────────────────────────────────────────
  const driversSnap = await db.collection("drivers").get();

  for (const docSnap of driversSnap.docs) {
    const driver     = docSnap.data();
    const driverKey  = docSnap.id;
    const driverName = String(driver.name || "").trim();

    const files = Array.isArray(driver.files) ? driver.files : [];
    if (!files.some((f) => f.driveFileId)) { report.drivers.skipped++; continue; }

    try {
      const { folderId: driverFolderId, folderName: driverFolderName } =
        await ensureDriverFolder(drive, driverKey, driverName);

      const newFiles = [];
      for (const file of files) {
        if (!file.driveFileId) { newFiles.push(file); continue; }
        const { moved } = await moveFile(drive, file.driveFileId, driverFolderId);
        if (moved) {
          report.drivers.filesMoved++;
          newFiles.push({ ...file, folderId: driverFolderId, folderName: driverFolderName });
        } else {
          newFiles.push(file);
        }
      }

      await db.collection("drivers").doc(docSnap.id).update({ files: newFiles });
      report.drivers.processed++;
    } catch (err) {
      report.drivers.errors.push(`${driverName || driverKey}: ${err.message}`);
    }
  }

  const totalMoved = report.trucks.filesMoved + report.drivers.filesMoved;
  return json(200, { success: true, totalMoved, report });
};
