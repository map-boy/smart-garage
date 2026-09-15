/**
 * Firebase Storage handle.
 *
 * Kept apart from lib/firebase.ts so that the Storage SDK is only pulled into
 * the bundle where it is actually used - the technician console and invoice
 * PDFs - rather than by every screen that needs Firestore.
 */
import { getApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const storage = getStorage(getApp(), `gs://${firebaseConfig.storageBucket}`);
