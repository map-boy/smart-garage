// usage: node scripts/bootstrap-garage.cjs [adminPassword] [bossPassword]
// Creates or updates the admin (technician) and boss accounts in the garage project.
// A password you pass is set; with no password, an existing account is left alone and a new one gets a random password.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const sa = JSON.parse(fs.readFileSync(path.resolve(root, '..', 'service-account.json'), 'utf8'));
if (sa.project_id !== 'garage-management-6f1eb') { console.error('service-account.json is for ' + sa.project_id); process.exit(2); }
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: cert(sa) });
const ORG = 'cv-smart-garage';
const loginFile = path.join(root, 'admin-login.txt');
const old = fs.existsSync(loginFile) ? fs.readFileSync(loginFile, 'utf8') : '';
const grab = (k) => (old.match(new RegExp('^' + k + ': (\\S+)', 'm')) || [])[1];
const rnd = () => crypto.randomBytes(9).toString('base64url');
const ACCOUNTS = [
  { username: 'admin', name: 'Admin', role: 'technician', want: process.argv[2] || null },
  { username: 'boss', name: 'Boss', role: 'boss', want: process.argv[3] || null }
];
(async () => {
  const auth = getAuth(), out = {};
  for (const a of ACCOUNTS) {
    const email = a.username + '@hub.local';
    let u, pw = a.want;
    try {
      u = await auth.getUserByEmail(email);
      if (pw) await auth.updateUser(u.uid, { password: pw }); else pw = grab(a.username + ' password');
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      pw = pw || rnd();
      u = await auth.createUser({ email, password: pw, displayName: a.name });
    }
    await getFirestore().doc('hubUsers/' + u.uid).set({ name: a.name, username: a.username, role: a.role, orgId: ORG, active: true, createdAt: Date.now() }, { merge: true });
    out[a.username] = pw || '(unchanged)';
    console.log(a.username + ' ready (' + a.role + ')');
  }
  fs.writeFileSync(loginFile, 'project: garage-management-6f1eb\nadmin username: admin\nadmin password: ' + out.admin + '\nboss username: boss\nboss password: ' + out.boss + '\n');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });