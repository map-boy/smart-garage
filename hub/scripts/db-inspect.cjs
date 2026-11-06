// usage: node scripts/db-inspect.cjs
// Read-only: shows the hub's real Firestore structure and a sample doc from each collection.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const sa = JSON.parse(fs.readFileSync(path.resolve(root, '..', 'service-account.json'), 'utf8'));
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const ORG = 'cv-smart-garage';

function describe(data) {
  const out = {};
  for (const k of Object.keys(data)) out[k] = Array.isArray(data[k]) ? 'array' : typeof data[k];
  return out;
}

(async () => {
  const users = await db.collection('hubUsers').get();
  console.log('hubUsers: ' + users.size + ' doc(s)');
  users.docs.slice(0, 5).forEach((d) => console.log('  ' + d.id + ' ->', describe(d.data()), JSON.stringify(d.data())));

  const visitors = await db.collection(`hubOrgs/${ORG}/visitors`).limit(5).get();
  const visitorsAll = await db.collection(`hubOrgs/${ORG}/visitors`).count().get();
  console.log('hubOrgs/' + ORG + '/visitors: ' + visitorsAll.data().count + ' doc(s), showing up to 5');
  visitors.docs.forEach((d) => console.log('  ' + d.id + ' ->', describe(d.data())));

  const visits = await db.collection(`hubOrgs/${ORG}/visits`).orderBy('createdAt', 'desc').limit(5).get();
  const visitsAll = await db.collection(`hubOrgs/${ORG}/visits`).count().get();
  console.log('hubOrgs/' + ORG + '/visits: ' + visitsAll.data().count + ' doc(s), showing 5 most recent');
  visits.docs.forEach((d) => console.log('  ' + d.id + ' ->', describe(d.data())));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });