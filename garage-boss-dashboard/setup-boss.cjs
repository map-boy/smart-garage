require('dotenv').config({ path: '.env.local' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const GARAGE_ID = 'Hc6ZDY56FKR2qeIweRoVYSTDTXj1';
const BOSS_UID = 'cbSnkjiIeMcXzX1jsDX0jknp11q2';
const BOSS_EMAIL = process.env.VITE_BOSS_EMAIL;

async function setup() {
  if (!GARAGE_ID) throw new Error('VITE_GARAGE_ID missing from .env.local');

  await db.collection('garages').doc(GARAGE_ID).set({
    name: 'Felix Garage',
    ownerEmail: BOSS_EMAIL
  }, { merge: true });
  console.log('Garage doc written:', GARAGE_ID);

  await db.collection('users').doc(BOSS_UID).set({
    role: 'BOSS',
    garageId: GARAGE_ID,
    displayName: 'Felix'
  });
  console.log('Boss profile written for UID:', BOSS_UID);
}

setup().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });



