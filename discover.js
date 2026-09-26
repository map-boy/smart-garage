const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const key = require("./service-account.json");

initializeApp({ credential: cert(key) });
const db = getFirestore();

(async () => {
  const garages = await db.collection("garages").listDocuments();
  console.log("=== garages ===");
  for (const g of garages) console.log(g.id);

  for (const g of garages) {
    const visits = await db.collection("garages").doc(g.id).collection("visits")
      .where("visitDate", ">=", "2026-09-01")
      .where("visitDate", "<=", "2026-09-30")
      .get();
    console.log(`\n=== ${g.id} visits Sept 2026: ${visits.size} ===`);
    visits.docs.slice(0, 5).forEach(d => console.log(d.id, d.data()));
  }
})().catch(e => console.error(e));
