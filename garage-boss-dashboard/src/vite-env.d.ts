/// <reference types="vite/client" />

/*
 * Build-time configuration the dashboard reads through import.meta.env.
 * Declaring the keys here means a typo like VITE_GARAGEID is a compile
 * error rather than an `undefined` that only shows up in production.
 */
interface ImportMetaEnv {
  readonly VITE_GARAGE_ID?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
