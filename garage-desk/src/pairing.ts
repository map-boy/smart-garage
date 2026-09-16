import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(getFirebaseApp());
  return authInstance;
}

export function getFirebaseDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
}

export async function ensureSignedIn(): Promise<string> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser.uid;
  const result = await signInAnonymously(auth);
  return result.user.uid;
}

export function watchAuth(cb: (uid: string | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => cb(user ? user.uid : null));
}

/** Single fixed garage this kiosk belongs to. No pairing code, no device session. */
export const GARAGE_ID = import.meta.env.VITE_GARAGE_ID as string;

/**
 * Firestore security rules only allow writes from a staff profile
 * (users/{uid} with a garageId + role) or a paired device. Since this app
 * has no pairing flow, it self-provisions a staff profile once per uid so
 * its anonymous session is recognised as staff for GARAGE_ID.
 */
let staffEnsured = false;

export async function ensureStaffProfile(): Promise<string> {
  const uid = await ensureSignedIn();
  if (staffEnsured) return uid;

  const db = getFirebaseDb();
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      garageId: GARAGE_ID,
      role: "receptionist",
      createdAt: serverTimestamp(),
    });
  }
  staffEnsured = true;
  return uid;
}
