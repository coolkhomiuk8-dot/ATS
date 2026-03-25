import { getDriveClient } from "./_drive.js";
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

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    await requireAdminOrRoot(event.headers.authorization || event.headers.Authorization);

    const payload = JSON.parse(event.body || "{}");
    const fileId = String(payload.fileId || "").trim();

    if (!fileId) {
      return json(400, { error: "fileId is required." });
    }

    const drive = await getDriveClient();
    await drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });

    return json(200, { ok: true, fileId });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return json(statusCode, {
      error: error.message || "Failed to delete file from Google Drive.",
    });
  }
};
