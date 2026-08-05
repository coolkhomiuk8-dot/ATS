// Scheduled at 20:00 UTC = 04:00 PM Eastern Time (EDT, UTC-4), Mon–Fri.
// Same call-stats digest as the owner's, posted to the dispatch team's group
// chat instead — visible to everyone there. One of three weekday check-ins
// (9am / 1pm / 4pm ET) — see _call-stats.js's sendGroupDigest().

import { sendGroupDigest } from "./_call-stats.js";

export const handler = async () => ({ statusCode: 200, body: await sendGroupDigest() });
