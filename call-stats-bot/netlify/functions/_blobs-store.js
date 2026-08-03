// Netlify Blobs' zero-config auto-detection only works for deploys that go
// through Netlify's own CI build pipeline — this site is deployed manually
// via CLI (no git-linked continuous deployment yet), which doesn't populate
// that automatic context. Configuring explicitly with siteID + token works
// regardless of how the deploy happened.

import { getStore } from "@netlify/blobs";

const SITE_ID = "51c75410-6595-4716-9709-2c9bda8efc06";

export function getHistoryStore() {
  return getStore({
    name: "call-stats-history",
    siteID: SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}
