import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const env = (import.meta as any).env;
export const hasFirebaseConfig = !!env.VITE_FIREBASE_PROJECT_ID;

export function getFirebaseApp() {
  if (!hasFirebaseConfig) return null;
  const apps = getApps();
  if (apps.length) return apps[0];
  return initializeApp({
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  });
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}
