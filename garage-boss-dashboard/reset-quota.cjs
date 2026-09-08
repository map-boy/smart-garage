const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./service-account.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function resetQuota() {
  await db.collection("garages").doc("Q38hWkx9UNhAPd2umCV1QmZrgSF3").update({
    whatsappMessagesUsed: 0,
    whatsappMessagesLimit: 1000,
  });
  console.log("Quota reset to 0/1000.");
}
resetQuota().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
