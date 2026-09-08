const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./garage-management-6f1eb-firebase-adminsdk-fbsvc-79e6282ea3.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const uid = 'cbSnkjiIeMcXzX1jsDX0jknp11q2';
  const targetGarageId = 'Hc6ZDY56FKR2qeIweRoVYSTDTXj1';

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    console.log('PROBLEM: users/' + uid + ' does NOT exist. This is why every rule check fails.');
    return;
  }

  const data = userDoc.data();
  console.log('User doc found:', JSON.stringify(data, null, 2));
  console.log('---');
  console.log('garageId matches target?', data.garageId === targetGarageId, '(doc has:', data.garageId, ', target:', targetGarageId, ')');

  const staffRoles = ['owner', 'manager', 'technician', 'receptionist', 'store_keeper', 'cashier', 'BOSS'];
  const managerRoles = ['owner', 'manager', 'BOSS'];
  console.log('role is staff?', staffRoles.includes(data.role), '(role:', data.role, ')');
  console.log('role is manager? (needed for archive delete/write)', managerRoles.includes(data.role));
}

main().catch(console.error);
