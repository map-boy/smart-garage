// usage: node scripts/reset-password.cjs <username> [newPassword]
// Resets any hub user's password via the Admin SDK directly - no Cloud Functions / Blaze needed.
// Run from a machine that has ../service-account.json (the same one bootstrap-garage.cjs uses).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const sa = JSON.parse(fs.readFileSync(path.resolve(root, '..', 'service-account.json'), 'utf8'));
if (sa.project_id !== 'garage-management-6f1eb') { console.error('service-account.json is for ' + sa.project_id); process.exit(2); }
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: cert(sa) });

const username = (process.argv[2] || '').trim().toLowerCase();
if (!username) { console.error('usage: node scripts/reset-password.cjs <username> [newPassword]'); process.exit(1); }
const newPassword = process.argv[3] || crypto.randomBytes(9).toString('base64url');

(async () => {
  const auth = getAuth();
  const email = username + '@hub.local';
  let u;
  try { u = await auth.getUserByEmail(email); }
  catch { console.error('No such account: ' + username); process.exit(1); }
  await auth.updateUser(u.uid, { password: newPassword });
  const snap = await getFirestore().doc('hubUsers/' + u.uid).get();
  const role = snap.exists ? snap.data().role : '(no profile)';
  console.log(username + ' (' + role + ') password is now: ' + newPassword);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });