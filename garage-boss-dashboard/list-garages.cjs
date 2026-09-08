const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function listGarages() {
  const snap = await db.collection('garages').get();
  if (snap.empty) {
    console.log('No garages found.');
    return;
  }
  snap.forEach(doc => {
    console.log(doc.id, '=>', JSON.stringify(doc.data()));
  });
}

listGarages().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
