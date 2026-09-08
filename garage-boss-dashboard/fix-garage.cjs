const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./service-account.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function fixGarage() {
  await db.collection("garages").doc("Q38hWkx9UNhAPd2umCV1QmZrgSF3").update({
    whatsappSessionId: "6eb3eb27-e89a-456b-8b44-842a486179c2",
    whatsappSessionStatus: "ready",
  });
  console.log("Garage updated successfully.");
}
fixGarage().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
