const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('./garage-management-6f1eb-firebase-adminsdk-fbsvc-79e6282ea3.json');

const { initializeApp: initClient } = require('firebase/app');
const { getAuth: getClientAuth, signInWithCustomToken } = require('firebase/auth');
const { getFirestore, doc, collection, writeBatch, connectFirestoreEmulator } = require('firebase/firestore');

initializeApp({ credential: cert(serviceAccount) });

async function main() {
  const uid = 'cbSnkjiIeMcXzX1jsDX0jknp11q2';
  const garageId = 'Hc6ZDY56FKR2qeIweRoVYSTDTXj1';

  const customToken = await getAuth().createCustomToken(uid);

  // PASTE YOUR ACTUAL FIREBASE CLIENT CONFIG HERE ? same values your app uses
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "garage-management-6f1eb.firebaseapp.com",
    projectId: "garage-management-6f1eb",
  };

  const clientApp = initClient(firebaseConfig);
  const clientAuth = getClientAuth(clientApp);
  const db = getFirestore(clientApp);

  await signInWithCustomToken(clientAuth, customToken);
  console.log('Signed in as:', clientAuth.currentUser.uid);

  const archiveId = `archive_test_${Date.now()}`;

  try {
    const recordRef = doc(collection(db, 'garages', garageId, 'archives', archiveId, 'records'), 'jobs_0000');
    const batch1 = writeBatch(db);
    batch1.set(recordRef, { kind: 'jobs', index: 0, rows: [{ test: true }] });
    await batch1.commit();
    console.log('STEP 1 (write record chunk) SUCCEEDED');

    const archiveRef = doc(db, 'garages', garageId, 'archives', archiveId);
    const batch2 = writeBatch(db);
    batch2.set(archiveRef, { archivedAt: new Date().toISOString(), complete: true, test: true });
    await batch2.commit();
    console.log('STEP 2 (write manifest doc) SUCCEEDED');

    console.log('ALL STEPS PASSED ? reset month should work.');
  } catch (err) {
    console.log('FAILED AT:', err.code, err.message);
  }
}

main().catch(console.error);
