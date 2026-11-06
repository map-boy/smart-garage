const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const crypto = require('crypto');

initializeApp();

// Only a technician (admin) can reset a password, and only within their own org.
// Nothing is stored in plaintext anywhere; the new password is returned once to the caller.
exports.resetHubPassword = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = getFirestore();
  const callerSnap = await db.doc('hubUsers/' + request.auth.uid).get();
  const caller = callerSnap.data();
  if (!caller || caller.role !== 'technician') {
    throw new HttpsError('permission-denied', 'Only the admin can reset passwords.');
  }
  const targetUid = request.data && request.data.targetUid;
  if (!targetUid || typeof targetUid !== 'string') throw new HttpsError('invalid-argument', 'targetUid required.');
  const targetSnap = await db.doc('hubUsers/' + targetUid).get();
  const target = targetSnap.data();
  if (!target || target.orgId !== caller.orgId) throw new HttpsError('not-found', 'No such account in your organisation.');

  const requested = request.data && request.data.newPassword;
  if (requested != null && (typeof requested !== 'string' || requested.length < 6)) {
    throw new HttpsError('invalid-argument', 'New password needs at least 6 characters.');
  }
  const newPassword = requested || crypto.randomBytes(9).toString('base64url');
  await getAuth().updateUser(targetUid, { password: newPassword });
  return { password: newPassword };
});