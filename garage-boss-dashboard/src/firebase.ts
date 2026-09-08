import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const env = (import.meta as any).env;

const firebaseConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'us-central1');
export const sendManualWhatsAppFn = httpsCallable(functions, 'sendManualWhatsApp');
export const createWhatsAppSessionFn = httpsCallable(functions, 'createWhatsAppSession');
export const getWhatsAppSessionStatusFn = httpsCallable(functions, 'getWhatsAppSessionStatus');
export const getWhatsAppQrFn = httpsCallable(functions, 'getWhatsAppQr');
export const requestWhatsAppPairingCodeFn = httpsCallable(functions, 'requestWhatsAppPairingCode');
export const wakeVmFn = httpsCallable(functions, 'wakeVm');
export const getVmStatusFn = httpsCallable(functions, 'getVmStatus');
export const disconnectWhatsAppSessionFn = httpsCallable(functions, 'disconnectWhatsAppSession');
export const restartWhatsAppSessionFn = httpsCallable(functions, 'restartWhatsAppSession');

/**
 * Session statuses that mean "this number can send a message right now".
 *
 * Mirrors SESSION_READY_STATES in functions/src/lib/openwa.ts. These drifted
 * apart once: the backend accepted 'ready' while this dashboard only checked
 * for 'connected', so a perfectly healthy session displayed as unlinked and
 * operators re-scanned QR codes that were never the problem. The backend now
 * also returns a `ready` boolean it has already evaluated — prefer that, and
 * keep this list only as a fallback for an older deployed backend.
 */
export const SESSION_READY_STATES = [
  'ready',
  'connected',
  'active',
  'authenticated',
];

export function isSessionReady(status?: string | null): boolean {
  return !!status && SESSION_READY_STATES.includes(status.toLowerCase());
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Logs a Firestore failure with auth context and returns a readable message.
 *
 * Deliberately does not throw: it is called from onSnapshot error callbacks,
 * where throwing produced an unhandled rejection that took down the whole
 * dashboard because one collection was unreadable.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): string {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));

  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'permission-denied':
      return 'You do not have permission to view this data.';
    case 'unavailable':
      return 'Connection lost. Retrying automatically.';
    case 'resource-exhausted':
      return 'The service is busy right now. Please try again shortly.';
    default:
      return error instanceof Error ? error.message : 'Something went wrong.';
  }
}




