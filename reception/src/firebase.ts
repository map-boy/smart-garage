import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
} from "firebase/firestore";

const env = (import.meta as any).env;

export const app = initializeApp({
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
});

export const auth = getAuth(app);

/**
 * Offline store, on by default.
 *
 * A gate has the worst signal on the property. A check-in typed with no bars
 * must be accepted instantly and pushed later - if the receptionist has to
 * wait for a spinner, they stop using the app and go back to paper.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager({ forceOwnership: true }),
  }),
});

/** Plates are typed by hand under time pressure; compare them normalised. */
export function normalisePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}