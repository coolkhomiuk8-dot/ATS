// Server-side fallback for driver stage changes.
//
// The recruiter's browser has intermittent Firestore client-SDK failures
// (WebChannel drops, hung writes, "N writes then hangs" pattern) that we've
// been unable to fully eliminate client-side. This function accepts a stage
// change over plain HTTPS and applies it via the Firebase Admin SDK, which
// bypasses every layer of client-side Firestore transport / caching /
// offline-queue that could be broken on her machine.
//
// Client calls this after a client-side write times out. If Admin-SDK write
// succeeds, we know the doc was persisted regardless of what the client
// thought happened locally.

import { withLambda } from "@netlify/aws-lambda-compat";
import { getDb, requireAdminOrRoot } from "./_auth.js";
import { FieldValue } from "firebase-admin/firestore";

function json(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default withLambda(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  try {
    await requireAdminOrRoot(event.headers.authorization || event.headers.Authorization);
  } catch (err) {
    return json(err.statusCode || 401, { error: err.message });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Invalid JSON body" }); }

  const { docId, stage, nextAction, nextActionTime, trainedBy, prevStage } = body;
  if (!docId)  return json(400, { error: "docId required" });
  if (!stage)  return json(400, { error: "stage required" });

  const db = getDb();

  try {
    const patch = { stage };
    if (nextAction) {
      patch.nextAction = nextAction;
      patch.nextActionTime = nextActionTime || "10:00";
    }
    if (stage === "hired" && trainedBy) patch.trainedBy = trainedBy;
    else patch.trainedBy = null;

    // Append stage-history entry if stage actually changes. FieldValue.arrayUnion
    // is the Admin-SDK equivalent of the client-side arrayUnion sentinel.
    if (prevStage && prevStage !== stage) {
      patch.stageHistory = FieldValue.arrayUnion({
        stage,
        date: todayStr(),
        ts: Date.now(),
      });
    }

    await db.collection("drivers").doc(String(docId)).update(patch);
    return json(200, { ok: true, docId, stage });
  } catch (err) {
    return json(500, { error: err.message || "Update failed" });
  }
});
