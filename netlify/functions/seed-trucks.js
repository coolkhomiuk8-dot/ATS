// ONE-TIME seed function — adds all trucks to Firestore, then DELETE this file
import { getDb } from "./_auth.js";

const TRUCKS = [
  { unit: "101", vin: "3C7WRVLG9PE527335" },
  { unit: "102", vin: "3C7WRVKG5LE138137" },
  { unit: "103", vin: "3C7WRVKG1LE137843" },
  { unit: "106", vin: "3C7WRVLG2NE138162" },
  { unit: "107", vin: "3C7WRVLG7NE138156" },
  { unit: "108", vin: "3C7WRVLG2NE138209" },
  { unit: "109", vin: "3C7WRVLG4PE527310" },
  { unit: "110", vin: "3C7WRVLG1PE527281" },
  { unit: "111", vin: "3C7WRVLG8PE527309" },
  { unit: "112", vin: "3C7WRVLG3RE151895" },
  { unit: "113", vin: "3C7WRVLG6RE151888" },
  { unit: "114", vin: "3C7WRVLG9NE138191" },
  { unit: "115", vin: "3C7WRVLG4PE527324" },
  { unit: "116", vin: "3C7WRVLG6PE527292" },
  { unit: "117", vin: "3C7WRVLG8NE140045" },
  { unit: "119", vin: "3C7WRVLG2NE138193" },
  { unit: "120", vin: "3C7WRVLG6PE527342" },
  { unit: "121", vin: "3C7WRVLG1NE131557" },
  { unit: "122", vin: "3C7WRVLG0PE527319" },
  { unit: "123", vin: "3C7WRVLG3PE527329" },
  { unit: "124", vin: "3C7WRVLG2PE527340" },
  { unit: "125", vin: "3C7WRVLG9PE527285" },
  { unit: "126", vin: "3C7WRVLG1PE501893" },
  { unit: "127", vin: "3C7WRVLG7PE527284" },
  { unit: "128", vin: "3C7WRVLG5NE138169" },
  { unit: "129", vin: "1FDBF6P87PKC09963" },
  { unit: "130", vin: "3C7WRVLG4PE527291" },
  { unit: "131", vin: "3C7WRVLG0RE151904" },
  { unit: "132", vin: "3C7WRVLG7RE151821" },
  { unit: "133", vin: "3C7WRVLGXRE151800" },
  { unit: "134", vin: "3C7WRVLG4PE527338" },
  { unit: "135", vin: "3C7WRVLG2RE151841" },
  { unit: "136", vin: "3C7WRVLG0RE151918" },
  { unit: "137", vin: "3C7WRVLGXRE138416" },
  { unit: "138", vin: "3C7WRVLG7RE151902" },
  { unit: "139", vin: "3C7WRVLG9RE151822" },
  { unit: "140", vin: "3C7WRVLG3PE527296" },
  { unit: "141", vin: "3C7WRVLGXRE138418" },
  { unit: "142", vin: "3C7WRVLG4NE131570" },
];

export const handler = async () => {
  const db = getDb();
  const batch = db.batch();

  for (const truck of TRUCKS) {
    const ref = db.collection("trucks").doc(truck.unit);
    batch.set(ref, {
      unit:      truck.unit,
      vin:       truck.vin.toUpperCase(),
      status:    "covered",   // default: all have drivers; mark free ones via /free
      updatedAt: new Date().toISOString(),
      updatedBy: "seed",
    });
  }

  await batch.commit();
  return {
    statusCode: 200,
    body: `Seeded ${TRUCKS.length} trucks successfully.`,
  };
};
