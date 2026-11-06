import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(cfg);
export const auth = getAuth(app);
// Offline-first: every write lands on the device instantly and syncs when online.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const toEmail = (username: string) => `${username.trim().toLowerCase()}@hub.local`;

// Technician creates accounts without being signed out (secondary app instance).
export async function createAccount(username: string, password: string): Promise<string> {
  const secondary = initializeApp(cfg, 'secondary-' + Date.now());
  try {
    const a = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(a, toEmail(username), password);
    await signOut(a);
    return cred.user.uid;
  } finally {
    await deleteApp(secondary);
  }
}

import { getFunctions, httpsCallable } from 'firebase/functions';
export const functions = getFunctions(app);

// Admin-only: resets another hub user's password via a Cloud Function. Returns the new password once.
export async function resetPassword(targetUid: string): Promise<string> {
  const call = httpsCallable<{ targetUid: string }, { password: string }>(functions, 'resetHubPassword');
  const res = await call({ targetUid });
  return res.data.password;
}