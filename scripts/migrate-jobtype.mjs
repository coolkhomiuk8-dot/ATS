// One-time migration: set jobType = "Conestoga" for all drivers without jobType
// Run: node scripts/migrate-jobtype.mjs

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCqXXvh7Q1gPnkY86IiZxA7mUyk_mT92Vc",
  authDomain: "drivers-crm.firebaseapp.com",
  projectId: "drivers-crm",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
  console.log("Fetching drivers...");
  const snapshot = await getDocs(collection(db, "drivers"));
  const toUpdate = snapshot.docs.filter((d) => !d.data().jobType);

  console.log(`Found ${snapshot.docs.length} drivers total, ${toUpdate.length} without jobType.`);

  let done = 0;
  for (const d of toUpdate) {
    await updateDoc(doc(db, "drivers", d.id), { jobType: "Conestoga" });
    done++;
    if (done % 10 === 0) console.log(`  Updated ${done}/${toUpdate.length}...`);
  }

  console.log(`Done! ${done} drivers updated to jobType = "Conestoga".`);
  process.exit(0);
}

migrate().catch((err) => { console.error(err); process.exit(1); });
